#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "${1:-}" == "--apply" ]] || { echo 'Uso: scripts/configurar-notificacoes-infra.sh --apply'; exit 1; }
project=gen-lang-client-0569062468
region=us-west1
service=plano-contas-iob
job=cci-notificacoes-processar
secret=cci-notificacoes-teams
principal=$(node -p "require('./notificacoes-runtime.json').serviceAccount")
audience=$(node -p "require('./notificacoes-runtime.json').audience")
actual_url=$(gcloud run services describe "$service" --region "$region" --project "$project" --format='value(status.url)')
[[ "$audience" == "$actual_url/api/internal/notificacoes/processar" ]] || { echo 'Audience diferente do serviço confirmado. Revise a configuração.'; exit 1; }
runtime=$(gcloud run services describe "$service" --region "$region" --project "$project" --format='value(spec.template.spec.serviceAccountName)')
if ! gcloud secrets describe "$secret" --project "$project" >/dev/null 2>&1; then
  gcloud secrets create "$secret" --replication-policy=automatic --project "$project" --quiet >/dev/null
fi
for role in roles/secretmanager.secretAccessor roles/secretmanager.secretVersionAdder; do
  gcloud secrets add-iam-policy-binding "$secret" --project "$project" --member="serviceAccount:$runtime" --role="$role" --quiet >/dev/null
done
if ! gcloud iam service-accounts describe "$principal" --project "$project" >/dev/null 2>&1; then
  gcloud iam service-accounts create cci-notificacoes-scheduler --display-name='CCI agenda de notificações' --project "$project" --quiet >/dev/null
fi
if gcloud scheduler jobs describe "$job" --location "$region" --project "$project" >/dev/null 2>&1; then action=update; else action=create; fi
gcloud scheduler jobs "$action" http "$job" --project "$project" --location "$region" --schedule='*/5 * * * *' --time-zone=America/Sao_Paulo --uri="$audience" --http-method=POST --headers='Content-Type=application/json' --message-body='{}' --oidc-service-account-email="$principal" --oidc-token-audience="$audience" --attempt-deadline=300s --max-retry-attempts=0 --quiet >/dev/null
if [[ "$action" == create ]]; then gcloud scheduler jobs pause "$job" --location "$region" --project "$project" --quiet >/dev/null; fi
echo 'Secret protegido e agenda autenticada configurados. As regras continuam dependendo de ativação pelos administradores.'
