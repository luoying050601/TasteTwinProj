#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"
pip install -r apps/api/requirements.txt
npm ci
VITE_API_BASE_URL='' npm run build
mkdir -p apps/api/app/static
cp -R apps/web/dist/. apps/api/app/static/
