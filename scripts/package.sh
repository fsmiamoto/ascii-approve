#!/usr/bin/env bash
# Build a Chrome Web Store zip: dist/ascii-approve-<version>.zip
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/build_arts.py
v=$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')
mkdir -p dist
out="dist/ascii-approve-$v.zip"
rm -f "$out"
zip -qr "$out" manifest.json icons src LICENSE
echo "$out"
