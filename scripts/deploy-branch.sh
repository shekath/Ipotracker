#!/usr/bin/env bash
# Builds the site and publishes it to the `hostinger-deploy` branch, which
# Hostinger's Git deploy pulls into public_html/stocks (stocks.shekathali.com).
# After running this, redeploy from hPanel → Advanced → Git (or ask Claude).
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch -q origin main
npm run build
export GIT_INDEX_FILE
GIT_INDEX_FILE=$(mktemp -u)
git --work-tree=dist add -A
TREE=$(git write-tree)
unset GIT_INDEX_FILE
SRC=$(git rev-parse --short HEAD)
COMMIT=$(git commit-tree "$TREE" -p "$(git rev-parse origin/main)" -m "Built site for Hostinger deploy (from $SRC)")
git push -f origin "$COMMIT:refs/heads/hostinger-deploy"
echo "Pushed built site $COMMIT to hostinger-deploy."
