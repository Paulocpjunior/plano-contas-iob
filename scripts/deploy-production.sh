#!/usr/bin/env bash
set -euo pipefail

readonly PROJECT_ID="gen-lang-client-0569062468"
readonly REGION="us-west1"
readonly SERVICE="plano-contas-iob"
readonly EXPECTED_URL="https://plano-contas-iob-q4woqnee3a-uw.a.run.app"

export CLOUDSDK_CORE_PROJECT="$PROJECT_ID"
export CLOUDSDK_RUN_REGION="$REGION"

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir"

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "ERRO: o deploy de produção exige uma árvore Git limpa."
  git status --short
  exit 1
fi

service_url="$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(status.url)')"

if [[ "$service_url" != "$EXPECTED_URL" ]]; then
  echo "ERRO: serviço resolvido em URL inesperada: $service_url"
  echo "Esperado: $EXPECTED_URL"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm ci --no-audit --no-fund
fi

npm run check

gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --quiet

expected_version="$(node -p "require('./version.json').version")"
published_version=""
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  published_version="$(curl -fsS --max-time 20 "$EXPECTED_URL/api/version" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).version||'')}catch(e){}})")"
  [[ "$published_version" == "$expected_version" ]] && break
  sleep 5
done

if [[ "$published_version" != "$expected_version" ]]; then
  echo "ERRO: versão publicada '$published_version' difere da esperada '$expected_version'."
  exit 1
fi

health_status="$(curl -fsS --max-time 20 "$EXPECTED_URL/api/health" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);process.stdout.write((j.status||'')+'|'+(j.versao||'')+'|'+(j.firestore||''))}catch(e){}})")"
if [[ "$health_status" != "ok|$expected_version|connected" ]]; then
  echo "ERRO: health check inesperado: $health_status"
  exit 1
fi

revision="$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(status.latestReadyRevisionName)')"

echo "Deploy validado: $SERVICE $revision | versão $published_version | $EXPECTED_URL"
