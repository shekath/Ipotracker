#!/usr/bin/env bash
# Builds the site and publishes it to the `hostinger-deploy` branch, which
# Hostinger's Git deploy pulls into public_html/stocks (stocks.shekathali.com).
#
# Each build is committed on top of the current hostinger-deploy tip and pushed
# without force, so the server's `git pull` is always a fast-forward.
# After running this, redeploy from hPanel → Advanced → Git (or ask Claude).
#
# Usage: npm run deploy:branch            build and push
#        npm run deploy:branch -- --dry-run   build and commit locally, don't push
set -euo pipefail
cd "$(dirname "$0")/.."

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1
BRANCH=hostinger-deploy

git fetch -q origin main
if git fetch -q origin "$BRANCH" 2>/dev/null; then
  PARENT=$(git rev-parse "origin/$BRANCH")
else
  PARENT=$(git rev-parse origin/main) # first deploy: start the branch from main
fi

npm run build

INDEX=$(mktemp -u)
GIT_INDEX_FILE=$INDEX git --work-tree=dist add -A
TREE=$(GIT_INDEX_FILE=$INDEX git write-tree)
rm -f "$INDEX"

if [ "$TREE" = "$(git rev-parse "$PARENT^{tree}")" ]; then
  echo "Build is identical to $BRANCH ($(git rev-parse --short "$PARENT")); nothing to deploy."
  exit 0
fi

SRC=$(git rev-parse --short HEAD)
COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "Built site for Hostinger deploy (from $SRC)")

if [ "$DRY_RUN" = 1 ]; then
  echo "Dry run: built $COMMIT on top of $(git rev-parse --short "$PARENT"); not pushed."
  git diff --stat "$PARENT" "$COMMIT" | tail -5
  exit 0
fi

git push origin "$COMMIT:refs/heads/$BRANCH"
echo "Pushed built site $COMMIT to $BRANCH. Now redeploy in hPanel → Advanced → Git."
