#!/usr/bin/env bash
# Regenerate every platform icon from the two SVG sources.
#
#   app-icon.svg         macOS  — Apple's inset grid (824 body in a 1024 canvas)
#   app-icon-square.svg  Windows/Linux — full bleed
#
# macOS shrinks nothing for you: an icon that fills its canvas looks oversized
# next to every other app in the Dock, which is why the two differ.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cargo tauri icon app-icon-square.svg -o "$TMP/square" >/dev/null
cargo tauri icon app-icon.svg        -o "$TMP/inset"  >/dev/null

rm -rf src-tauri/icons
mkdir -p src-tauri/icons
# Base set: full-bleed (Windows .ico, Linux PNGs, Store logos)
cp "$TMP"/square/*.png "$TMP"/square/icon.ico src-tauri/icons/
# macOS bundle icon: the inset variant
cp "$TMP"/inset/icon.icns src-tauri/icons/

cp src-tauri/icons/128x128@2x.png ui/apple-touch-icon.png
echo "Icons regenerated."
