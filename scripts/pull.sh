#!/bin/bash
# Pull-based deploy: move a serving checkout to the tip of origin/<branch>.
# Run on a timer (launchd StartInterval); a no-op unless the branch moved.
#   scripts/pull.sh <checkout> [branch]   (branch defaults to main)
set -euo pipefail
dir=${1:?usage: pull.sh <checkout> [branch]}
branch=${2:-main}
cd "$dir"
git fetch -q origin "$branch"
new=$(git rev-parse FETCH_HEAD)
[ "$(git rev-parse HEAD)" = "$new" ] && exit 0
git checkout -q --detach "$new"
echo "$(date '+%F %T') deployed $(git log -1 --format='%h %s') from $branch"
