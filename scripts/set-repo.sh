#!/usr/bin/env bash
# Point the in-app updater at a GitHub repository.
#   ./scripts/set-repo.sh <github-user> <repo-name>
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "usage: $0 <github-user> <repo-name>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="$ROOT/src-tauri/tauri.conf.json"
ENDPOINT="https://github.com/$1/$2/releases/latest/download/latest.json"

python3 - "$CONF" "$ENDPOINT" <<'PY'
import json, sys
conf, endpoint = sys.argv[1], sys.argv[2]
with open(conf) as f:
    data = json.load(f)
data["plugins"]["updater"]["endpoints"] = [endpoint]
with open(conf, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY

echo "Updater endpoint set to:"
echo "  $ENDPOINT"
