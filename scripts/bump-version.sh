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

echo ""
echo "============================================"
echo "  Versao bumpada: ${CURRENT} -> ${NEW_VERSION}"
echo "  Build date: ${BUILD_DATE}"
echo "============================================"
echo ""
echo "Proximo passo:"
echo "  git add version.json package.json"
echo "  git commit -m 'chore(version): bump ${CURRENT} -> ${NEW_VERSION}'"
echo "  git tag v${NEW_VERSION}"
echo "  gcloud run deploy ..."
