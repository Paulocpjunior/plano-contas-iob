#!/usr/bin/env bash
# Bump automatico da versao do plano-contas-iob.
# Uso:
#   ./scripts/bump-version.sh         -> bump patch (3.1.0 -> 3.1.1)
#   ./scripts/bump-version.sh minor   -> bump minor (3.1.x -> 3.2.0)
#   ./scripts/bump-version.sh major   -> bump major (3.x.x -> 4.0.0)
#
# Le commits desde a ultima versao e gera release_notes filtrando chore/fix(deps).
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION_FILE="version.json"
BUMP_TYPE="${1:-patch}"

if [ ! -f "$VERSION_FILE" ]; then
  echo "ERRO: $VERSION_FILE nao encontrado" >&2
  exit 1
fi

CURRENT=$(node -e "console.log(require('./version.json').version)")
IFS='.' read -r MAJ MIN PAT <<< "$CURRENT"

case "$BUMP_TYPE" in
  patch) PAT=$((PAT + 1)) ;;
  minor) MIN=$((MIN + 1)); PAT=0 ;;
  major) MAJ=$((MAJ + 1)); MIN=0; PAT=0 ;;
  *) echo "ERRO: tipo de bump invalido (use patch|minor|major)" >&2; exit 1 ;;
esac

NEW_VERSION="${MAJ}.${MIN}.${PAT}"
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Acha tag/commit da versao atual pra pegar commits desde la
LAST_TAG=$(git tag -l "v${CURRENT}" | head -1)
if [ -n "$LAST_TAG" ]; then
  COMMIT_RANGE="${LAST_TAG}..HEAD"
else
  # Fallback: pega ultimos 20 commits se nao houver tag
  COMMIT_RANGE="HEAD~20..HEAD"
fi

# Extrai commits relevantes (filtra chore: e fix(deps): que sao ruido)
RAW_NOTES=$(git log "$COMMIT_RANGE" --pretty=format:"%s" 2>/dev/null \
  | grep -viE '^(chore|fix\(deps\)|merge|revert)' \
  | head -10 \
  || echo "")

if [ -z "$RAW_NOTES" ]; then
  RAW_NOTES="Melhorias internas e correcoes"
fi

# Monta JSON com node (mais seguro que sed)
node << JSEOF
const fs = require('fs');
const notes = \`${RAW_NOTES}\`.split('\n').filter(Boolean).map(s => s.trim());
const data = {
  version: "${NEW_VERSION}",
  build_date: "${BUILD_DATE}",
  release_notes: notes
};
fs.writeFileSync('version.json', JSON.stringify(data, null, 2) + '\n');
console.log('[bump] ${CURRENT} -> ${NEW_VERSION}');
console.log('[bump] ' + notes.length + ' release notes extraidas');
JSEOF

# Atualiza package.json tambem
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
pkg.version = '${NEW_VERSION}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# ─── PROPAGA A VERSAO PARA TODO ARQUIVO QUE A CARREGA ───────────────────────
#
# MATA-BURRO (12/08/2026): o bump escrevia so version.json/package.json, e o
# gate de qualidade (scripts/test-product-quality-features.js) exige que os
# cache-busters ?v=<versao> de index.html, auditai/index.html e
# auditai/conciliacao.html batam com a versao ATUAL. Resultado: TODO bump
# quebrava o deploy, e cada um lembrava de um subconjunto dos arquivos a mao
# (dois deploys caidos seguidos, v3.4.105 e v3.4.106).
#
# Nao e caso de "lembrar melhor": o script que muda a versao e quem tem que
# propaga-la. Arquivo novo com cache-buster entra NESTA lista.
ARQUIVOS_COM_VERSAO=(
  "index.html"
  "auditai/index.html"
  "auditai/conciliacao.html"
  "auditai/conciliacao-arquivos.js"
)
for arq in "${ARQUIVOS_COM_VERSAO[@]}"; do
  if [ ! -f "$arq" ]; then
    echo "[bump] AVISO: $arq nao existe — cache-buster nao propagado" >&2
    continue
  fi
  # SO os dois padroes que carregam a versao. Trocar qualquer x.y.z do arquivo
  # atingiria versao de biblioteca, data e o que mais parecesse versao — o
  # index.html tem milhares de linhas.
  sed -i.bak -E \
    -e "s/\?v=[0-9]+\.[0-9]+\.[0-9]+/?v=${NEW_VERSION}/g" \
    -e "s/(__PLANO_CONTAS_IOB_BUILD__ = ')[0-9]+\.[0-9]+\.[0-9]+/\1${NEW_VERSION}/g" \
    -e "s/(window\.__PLANO_CONTAS_IOB_BUILD__ \|\| ')[0-9]+\.[0-9]+\.[0-9]+/\1${NEW_VERSION}/g" \
    -e "s/(AUDITAI_MOTOR_VERSION = ')[0-9]+\.[0-9]+\.[0-9]+/\1${NEW_VERSION}/g" \
    -e "s/(Motor conciliacao v)[0-9]+\.[0-9]+\.[0-9]+/\1${NEW_VERSION}/g" \
    "$arq" && rm -f "$arq.bak"
  echo "[bump] cache-buster de $arq -> ${NEW_VERSION}"
done

echo ""
echo "============================================"
echo "  Versao bumpada: ${CURRENT} -> ${NEW_VERSION}"
echo "  Build date: ${BUILD_DATE}"
echo "============================================"
echo ""
echo "Proximo passo:"
echo "  git add version.json package.json index.html auditai/"
echo "  git commit -m 'chore(version): bump ${CURRENT} -> ${NEW_VERSION}'"
echo "  git tag v${NEW_VERSION}"
echo "  gcloud run deploy ..."
