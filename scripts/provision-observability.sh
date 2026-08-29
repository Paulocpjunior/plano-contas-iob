#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-gen-lang-client-0569062468}"
SERVICE_HOST="${CCI_SERVICE_HOST:-plano-contas-iob-q4woqnee3a-uw.a.run.app}"
DISPLAY_NAME="CCI produção - API health"

upsert_counter_metric() {
  local name="$1" filter="$2" description="$3"
  if gcloud logging metrics describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud logging metrics update "$name" --project="$PROJECT_ID" --description="$description" --log-filter="$filter" --quiet
  else
    gcloud logging metrics create "$name" --project="$PROJECT_ID" --description="$description" --log-filter="$filter" --quiet
  fi
}

upsert_counter_metric cci_session_failures 'resource.type="cloud_run_revision" AND jsonPayload.event="cci_http_request" AND jsonPayload.flow="session" AND jsonPayload.status>=400' 'Falhas HTTP no salvamento de sessão do CCI.'
upsert_counter_metric cci_import_failures 'resource.type="cloud_run_revision" AND jsonPayload.event="cci_http_request" AND jsonPayload.flow="import" AND jsonPayload.status>=400' 'Falhas HTTP nos fluxos de importação do CCI.'
upsert_counter_metric cci_parser_failures 'resource.type="cloud_run_revision" AND jsonPayload.event="cci_http_request" AND jsonPayload.flow="parser" AND jsonPayload.status>=400' 'Falhas HTTP nos parsers do CCI.'
upsert_counter_metric cci_http_409 'resource.type="cloud_run_revision" AND jsonPayload.event="cci_http_request" AND jsonPayload.status=409' 'Conflitos HTTP 409 observados pelo CCI.'

if gcloud logging metrics describe cci_session_latency_ms --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud logging metrics update cci_session_latency_ms --project="$PROJECT_ID" --config-from-file=monitoring/log-metric-session-latency.json --quiet
else
  gcloud logging metrics create cci_session_latency_ms --project="$PROJECT_ID" --config-from-file=monitoring/log-metric-session-latency.json --quiet
fi

UPTIME_ID=$(gcloud monitoring uptime list-configs --project="$PROJECT_ID" --format=json \
  | jq -r --arg nome "$DISPLAY_NAME" '.[] | select(.displayName == $nome) | .name | split("/")[-1]' \
  | head -n1)
if [ -n "$UPTIME_ID" ]; then
  gcloud monitoring uptime update "$UPTIME_ID" --project="$PROJECT_ID" \
    --display-name="$DISPLAY_NAME" --path=/api/health --port=443 --request-method=get \
    --validate-ssl=true --set-status-classes=2xx --matcher-type=contains-string \
    --matcher-content='"status":"ok"' --period=1 --timeout=10 \
    --set-regions=south-america,usa-oregon,europe --quiet
else
  gcloud monitoring uptime create "$DISPLAY_NAME" --project="$PROJECT_ID" \
    --resource-type=uptime-url --resource-labels="host=$SERVICE_HOST,project_id=$PROJECT_ID" \
    --protocol=https --path=/api/health --port=443 --request-method=get \
    --validate-ssl=true --status-classes=2xx --matcher-type=contains-string \
    --matcher-content='"status":"ok"' --period=1 --timeout=10 \
    --regions=south-america,usa-oregon,europe --quiet
fi

UPTIME_ID=$(gcloud monitoring uptime list-configs --project="$PROJECT_ID" --format=json \
  | jq -r --arg nome "$DISPLAY_NAME" '.[] | select(.displayName == $nome) | .name | split("/")[-1]' \
  | head -n1)
test -n "$UPTIME_ID" || { echo "Uptime check criado, mas o identificador não foi localizado." >&2; exit 1; }

TOKEN=$(gcloud auth print-access-token)
POLICIES_URL="https://monitoring.googleapis.com/v3/projects/$PROJECT_ID/alertPolicies"
POLICIES=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$POLICIES_URL?pageSize=100")
for arquivo in monitoring/alert-policies/*.json; do
  temporario=$(mktemp)
  sed -e "s/__PROJECT_ID__/$PROJECT_ID/g" -e "s/__UPTIME_ID__/$UPTIME_ID/g" "$arquivo" > "$temporario"
  nome=$(jq -r '.displayName' "$temporario")
  existente=$(printf '%s' "$POLICIES" | jq -r --arg nome "$nome" '.alertPolicies[]? | select(.displayName == $nome) | .name' | head -n1)
  if [ -n "$existente" ]; then
    curl -fsS -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      --data-binary "@$temporario" \
      "https://monitoring.googleapis.com/v3/$existente?updateMask=displayName,documentation,conditions,combiner,enabled,userLabels" >/dev/null
    echo "Política atualizada: $nome"
  else
    curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      --data-binary "@$temporario" "$POLICIES_URL" >/dev/null
    echo "Política criada: $nome"
  fi
  rm -f "$temporario"
done

echo "Observabilidade base provisionada no projeto $PROJECT_ID."
