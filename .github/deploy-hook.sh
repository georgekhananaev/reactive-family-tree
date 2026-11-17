#!/bin/bash
# Asks the server to put this commit live as the public demo, through a hook:  HOOK=<address> deploy-hook.sh
#
# The hook is an n8n workflow that has the server fetch the images and swap the containers. GH_TOKEN is
# what the server fetches with: it can read this repository's packages and nothing more, and it stops
# working when the job ends. A run that a newer push to the same branch has overtaken does nothing,
# because that push's own run puts the newer commit live.
set -euo pipefail

head=$(gh api "repos/$GITHUB_REPOSITORY/commits/$GITHUB_REF_NAME" --jq .sha)
if [ "$head" != "$GITHUB_SHA" ]; then
  echo "$GITHUB_REF_NAME has moved on to $head, and its own run puts that live."
  exit 0
fi

body=$(jq --null-input --compact-output --arg revision "$GITHUB_SHA" --arg pass "$GH_TOKEN" '{revision: $revision, pass: $pass}')

for attempt in 1 2 3; do
  status=$(curl --silent --show-error --max-time 120 --output answer.json --write-out '%{http_code}' \
    --header 'Content-Type: application/json' --data "$body" "$HOOK") || status=000
  if [ "$status" = 200 ]; then break; fi
  echo "Attempt $attempt: the server answered $status."
  if [ "$attempt" != 3 ]; then sleep 15; fi
done
[ "$status" = 200 ]
jq --raw-output .message answer.json
jq --exit-status .ok answer.json > /dev/null
