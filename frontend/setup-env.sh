#!/usr/bin/env bash
# Create frontend/.env.<mode> (macOS Finder cannot name files starting with ".").
#   ./setup-env.sh pinggy https://xyz.a.pinggy.link USER PASSWORD   -> npm run dev:pinggy
#   ./setup-env.sh ssh http://localhost:12212                       -> npm run dev
set -euo pipefail
cd "$(dirname "$0")"
MODE="${1:-}"
URL="${2:-}"
USER="${3:-}"
PASS="${4:-}"
if [[ -z "$MODE" || -z "$URL" ]]; then
  echo "Usage: ./setup-env.sh <ssh|pinggy> <URL> [USER] [PASSWORD]"
  exit 1
fi
FILE=".env.$MODE"
{
  printf 'VITE_API_URL=%s\n' "${URL%/}"
  if [[ -n "$USER" && -n "$PASS" ]]; then
    printf 'VITE_API_USER=%s\n' "$USER"
    printf 'VITE_API_PASSWORD=%s\n' "$PASS"
  fi
} > "$FILE"
echo "Wrote frontend/$FILE:"
sed 's/VITE_API_PASSWORD=.*/VITE_API_PASSWORD=***/' "$FILE"
if [[ "$MODE" == "ssh" ]]; then
  echo "Restart: npm run dev"
else
  echo "Restart: npm run dev:$MODE"
fi
