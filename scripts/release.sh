#!/usr/bin/env bash
# Cut a new release: bump the version everywhere, tag it, push it.
# GitHub Actions then builds and publishes the installers.
#   ./scripts/release.sh 1.2.0
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <version>   e.g. $0 1.2.0" >&2
  exit 1
fi

VERSION="$1"
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "version must look like 1.2.0" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -n "$(git status --porcelain)" ]; then
  echo "working tree is dirty — commit your changes first" >&2
  exit 1
fi

python3 - "$VERSION" <<'PY'
import json, re, sys
version = sys.argv[1]

with open("src-tauri/tauri.conf.json") as f:
    conf = json.load(f)
conf["version"] = version
with open("src-tauri/tauri.conf.json", "w") as f:
    json.dump(conf, f, indent=2, ensure_ascii=False)
    f.write("\n")

with open("src-tauri/Cargo.toml") as f:
    cargo = f.read()
cargo = re.sub(r'(?m)^version = "[^"]+"$', f'version = "{version}"', cargo, count=1)
with open("src-tauri/Cargo.toml", "w") as f:
    f.write(cargo)
PY

# Keep Cargo.lock in step so CI does not have to resolve it again.
(cd src-tauri && cargo metadata --format-version 1 >/dev/null 2>&1 || true)

git add -A
git commit -m "Release v$VERSION"
git tag "v$VERSION"
git push origin HEAD
git push origin "v$VERSION"

echo
echo "Tag v$VERSION pushed. Watch the build here:"
echo "  $(git remote get-url origin | sed -e 's/\.git$//' -e 's#git@github.com:#https://github.com/#')/actions"
