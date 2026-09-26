#!/usr/bin/env bash
# Stores a Google OAuth client in .env.local and, if this folder is linked to a
# Vercel project, in Vercel's production environment.
#
#   scripts/set-google-client.sh ~/Downloads/client_secret_XXXX.json
#
# The JSON is the file Google Cloud Console offers after you create an OAuth
# client ("Download JSON"). It is read here and not copied anywhere else.
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:-}"
[ -f "$FILE" ] || { echo "usage: $0 path/to/client_secret.json" >&2; exit 1; }
read -r CLIENT_ID CLIENT_SECRET < <(python3 - "$FILE" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
c = d.get("web") or d.get("installed") or d
print(c["client_id"], c["client_secret"])
PY
)
touch .env.local
grep -v '^GOOGLE_CLIENT_ID=\|^GOOGLE_CLIENT_SECRET=' .env.local > .env.local.tmp || true
printf 'GOOGLE_CLIENT_ID=%s\nGOOGLE_CLIENT_SECRET=%s\n' "$CLIENT_ID" "$CLIENT_SECRET" >> .env.local.tmp
mv .env.local.tmp .env.local
chmod 600 .env.local
echo "saved GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local"
if [ -f .vercel/project.json ] && command -v vercel >/dev/null; then
  for NAME in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do vercel env rm "$NAME" production --yes >/dev/null 2>&1 || true; done
  printf '%s' "$CLIENT_ID" | vercel env add GOOGLE_CLIENT_ID production --yes >/dev/null
  printf '%s' "$CLIENT_SECRET" | vercel env add GOOGLE_CLIENT_SECRET production --yes >/dev/null
  echo "saved both to Vercel (production); run: npm run deploy"
fi
