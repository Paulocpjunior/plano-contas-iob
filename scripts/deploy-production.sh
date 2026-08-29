#!/usr/bin/env bash
set -euo pipefail

# O deploy manual e apenas uma porta de entrada para o MESMO workflow oficial.
# Ele nunca publica o checkout local: a origem sempre e origin/main, validada
# com auditoria, testes, candidata sem trafego, health e promocao controlada.
readonly REPOSITORY="Paulocpjunior/plano-contas-iob"
readonly WORKFLOW="deploy-app.yml"

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "ERRO: o acionamento de produção exige uma árvore Git limpa."
  git status --short
  exit 1
fi

if ! command -v gh >/dev/null 2>&1 || ! gh auth status >/dev/null 2>&1; then
  echo "ERRO: GitHub CLI autenticado é obrigatório para usar o fluxo oficial."
  exit 1
fi

git fetch origin main --quiet
head_sha="$(git rev-parse HEAD)"
main_sha="$(git rev-parse origin/main)"
if [[ "$head_sha" != "$main_sha" ]]; then
  echo "ERRO: deploy recusado. O checkout atual não é exatamente origin/main."
  echo "HEAD:        $head_sha"
  echo "origin/main: $main_sha"
  echo "Abra e mescle um PR; produção só aceita a linha oficial."
  exit 1
fi

before_run_id="$(gh api "repos/$REPOSITORY/actions/workflows/$WORKFLOW/runs?branch=main&event=workflow_dispatch&per_page=1" --jq '.workflow_runs[0].id // 0')"
gh api --method POST "repos/$REPOSITORY/actions/workflows/$WORKFLOW/dispatches" -f ref=main >/dev/null

run_id=""
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  candidate_id="$(gh api "repos/$REPOSITORY/actions/workflows/$WORKFLOW/runs?branch=main&event=workflow_dispatch&per_page=1" --jq '.workflow_runs[0].id // 0')"
  if [[ "$candidate_id" -gt "$before_run_id" ]]; then
    run_id="$candidate_id"
    break
  fi
  sleep 2
done

if [[ -z "$run_id" ]]; then
  echo "ERRO: workflow disparado, mas a execução não foi localizada."
  echo "Consulte: https://github.com/$REPOSITORY/actions/workflows/$WORKFLOW"
  exit 1
fi

echo "Deploy oficial acionado: https://github.com/$REPOSITORY/actions/runs/$run_id"
gh run watch "$run_id" --repo "$REPOSITORY" --exit-status
