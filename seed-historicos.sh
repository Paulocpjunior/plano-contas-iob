#!/usr/bin/env bash
# seed-historicos.sh
# ----------------------------------------------------------------
# Importa os 548 históricos padrão IOB SAGE para o Firestore via REST.
# Rode após o deploy do server.js + historicos-routes.js.
#
# Uso:
#   ./seed-historicos.sh                       # produção (URL padrão)
#   ./seed-historicos.sh http://localhost:8080 # local
# ----------------------------------------------------------------
set -euo pipefail

URL_BASE="${1:-https://plano-contas-iob-q4woqnee3a-uw.a.run.app}"
SEED_FILE="${SEED_FILE:-seeds/historicos-padrao-seed.json}"

if [[ ! -f "$SEED_FILE" ]]; then
  echo "❌ Arquivo de seed não encontrado: $SEED_FILE"
  echo "   Defina SEED_FILE=caminho/para/seed.json se estiver em outro lugar."
  exit 1
fi

echo "📋 Seed de Históricos Padrão IOB SAGE"
echo "   URL.....: $URL_BASE"
echo "   Arquivo.: $SEED_FILE"
echo ""

# Pegar o token Firebase Auth do admin-master
echo "👉 Cole o ID Token Firebase Auth de junior@spassessoriacontabil.com.br"
echo "   (no DevTools Console:  await firebase.auth().currentUser.getIdToken()  )"
echo ""
read -r -p "Token: " TOKEN
TOKEN="$(echo "$TOKEN" | tr -d '[:space:]')"

if [[ -z "$TOKEN" ]]; then
  echo "❌ Token vazio."
  exit 1
fi

# Construir payload no formato { items: [...] }
PAYLOAD="$(mktemp)"
trap "rm -f $PAYLOAD" EXIT
node -e "console.log(JSON.stringify({items: require('$PWD/$SEED_FILE')}))" > "$PAYLOAD"

TOTAL_ITENS="$(node -e "console.log(require('$PWD/$SEED_FILE').length)")"
echo ""
echo "📤 Enviando $TOTAL_ITENS históricos para $URL_BASE/api/historicos/import ..."
echo ""

RESPONSE_FILE="$(mktemp)"
trap "rm -f $PAYLOAD $RESPONSE_FILE" EXIT
HTTP_CODE="$(curl -sS -X POST "$URL_BASE/api/historicos/import" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "@$PAYLOAD" \
  -o "$RESPONSE_FILE" \
  -w "%{http_code}")"

echo "HTTP $HTTP_CODE"
echo ""
cat "$RESPONSE_FILE"
echo ""

if [[ "$HTTP_CODE" != "200" ]]; then
  echo ""
  echo "❌ Falha no import. Verifique:"
  echo "   - O token está válido (Firebase ID Tokens duram 1 hora)"
  echo "   - O usuário do token tem is_admin=true em users/{uid}"
  echo "   - O endpoint /api/historicos/import está deployado"
  exit 1
fi

echo ""
echo "✅ Seed concluído. Verifique abrindo $URL_BASE/admin.html → 📋 Históricos Padrão"
