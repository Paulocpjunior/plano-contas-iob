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

npm ci --no-audit --no-fund

npm run check

revision_suffix="r$(date -u +%Y%m%d%H%M%S)-$(git rev-parse --short=7 HEAD)"
deployed_revision="${SERVICE}-${revision_suffix}"

gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --revision-suffix "$revision_suffix" \
  --quiet

revision_ready="$(gcloud run revisions describe "$deployed_revision" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(status.conditions[0].status)')"

if [[ "$revision_ready" != "True" ]]; then
  echo "ERRO: a revisão esperada não ficou pronta: $deployed_revision ($revision_ready)"
  exit 1
fi

gcloud run services update-traffic "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --to-revisions "${deployed_revision}=100" \
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

published_contract="$(curl -fsS --max-time 20 "$EXPECTED_URL/layouts-fiscais-padrao.js?version=$expected_version")"
for required_marker in \
  "0109_fastweld_registro_entradas_iob_sage" \
  "0109_fastweld_registro_saidas_iob_sage" \
  "generico_servicos_tomados_efiscal_pdf" \
  "generico_servicos_prestados_efiscal_pdf"; do
  if [[ "$published_contract" != *"$required_marker"* ]]; then
    echo "ERRO: contrato fiscal publicado sem marcador obrigatório: $required_marker"
    exit 1
  fi
done

published_index="$(curl -fsS --max-time 20 "$EXPECTED_URL/index.html?version=$expected_version")"
published_filter="$(curl -fsS --max-time 20 "$EXPECTED_URL/filtro-fiscal.js?version=$expected_version")"
published_cadastro="$(curl -fsS --max-time 20 "$EXPECTED_URL/empresa-cadastro.js?version=$expected_version")"
published_whatsapp="$(curl -fsS --max-time 20 "$EXPECTED_URL/whatsapp-cfi-client.js?version=$expected_version")"
if [[ "$published_index" != *'id="filtroFiscalOverlay"'* || "$published_index" != *'window.LAYOUTS_FISCAIS_PADRAO.forEach'* ]]; then
  echo "ERRO: modal/fallback fiscal não foi publicado no index."
  exit 1
fi
if [[ "$published_filter" != *"function cfopsDoLancamento"* || "$published_filter" != *"tipo === 'CFOP'"* ]]; then
  echo "ERRO: filtro estruturado de CFOP não foi publicado."
  exit 1
fi
if [[ "$published_index" != *'placeholder="Número, nome ou CNPJ..."'* || "$published_index" != *'⚡ Ativar empresa'* ]]; then
  echo "ERRO: busca/ativação de empresa não foi publicada."
  exit 1
fi
if [[ "$published_cadastro" != *'function empresaBateBusca'* || "$published_whatsapp" != *'function enviarWhatsappCfi'* ]]; then
  echo "ERRO: contratos de cadastro/WhatsApp não foram publicados."
  exit 1
fi

traffic_revision="$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format=json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const t=(j.status.traffic||[]).find(x=>x.percent===100);process.stdout.write(t&&t.revisionName||'')})")"

if [[ "$traffic_revision" != "$deployed_revision" ]]; then
  echo "ERRO: o tráfego não permaneceu na revisão publicada: esperado $deployed_revision, atual $traffic_revision"
  exit 1
fi

echo "Deploy validado: $SERVICE $deployed_revision | versão $published_version | cadastro, busca, WhatsApp, contrato fiscal e CFOP conferidos | $EXPECTED_URL"
