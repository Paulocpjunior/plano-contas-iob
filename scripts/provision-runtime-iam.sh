#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${CCI_RUNTIME_PROJECT_ID:-gen-lang-client-0569062468}"
SERVICE_ACCOUNT_ID="${CCI_RUNTIME_SERVICE_ACCOUNT_ID:-cci-runtime}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
MEMBER="serviceAccount:${SERVICE_ACCOUNT}"

if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SERVICE_ACCOUNT_ID" \
    --project "$PROJECT_ID" \
    --display-name "CCI Cloud Run runtime"
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "$MEMBER" \
  --role roles/datastore.user \
  --condition=None \
  --quiet >/dev/null

for SECRET_NAME in GEMINI_API_KEY fiscal-gateway-token graph-client-secret reinf-cert-a1 reinf-cert-password; do
  gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
    --project "$PROJECT_ID" \
    --member "$MEMBER" \
    --role roles/secretmanager.secretAccessor \
    --condition=None \
    --quiet >/dev/null
done

for SECRET_NAME in reinf-cert-a1 reinf-cert-password; do
  gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
    --project "$PROJECT_ID" \
    --member "$MEMBER" \
    --role roles/secretmanager.secretVersionAdder \
    --condition=None \
    --quiet >/dev/null
done

echo "Conta dedicada pronta: ${SERVICE_ACCOUNT}"
echo "Projeto: roles/datastore.user"
echo "Secrets de leitura: GEMINI_API_KEY, fiscal-gateway-token, graph-client-secret, reinf-cert-a1, reinf-cert-password"
echo "Secrets com nova versão: reinf-cert-a1, reinf-cert-password"
