#!/usr/bin/env bash
set -euo pipefail

# Deploy script for Clausr AI standalone artifact
# Usage: GITHUB_TOKEN=ghp_xxx ./scripts/deploy-vps.sh
#
# Prerequisites:
#   1. Node.js 22+ installed on VPS
#   2. A GitHub PAT with "actions:read" scope for the repo
#   3. A systemd service (see deploy/clausr-app.service)
#   4. Environment file at /etc/clausr.env

APP_DIR="/opt/raipple/app"
DATA_DIR="/opt/raipple/data"
SKILLS_DIR="/opt/raipple/skills"
TMP_DIR="/opt/raipple/.deploy-tmp"
REPO="Juli-7/raipple-saas"
ARTIFACT_NAME="raipple-saas-standalone"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "ERROR: GITHUB_TOKEN must be set"
  echo "Create a token at https://github.com/settings/tokens (scope: actions:read)"
  exit 1
fi

# 1. Download latest artifact
echo "Fetching latest artifact from GitHub..."
RUN_ID=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/$REPO/actions/runs?branch=main&status=success&per_page=1" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['workflow_runs'][0]['id'])" 2>/dev/null)

if [ -z "$RUN_ID" ]; then
  echo "ERROR: No successful CI run found on main branch"
  exit 1
fi

echo "Downloading artifact from run #$RUN_ID..."
curl -L -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/actions/runs/$RUN_ID/artifacts" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
for a in data['artifacts']:
    if a['name'] == '$ARTIFACT_NAME':
        print(a['archive_download_url'])
        sys.exit(0)
print('ERROR: artifact not found', file=sys.stderr)
sys.exit(1)
" 2>/dev/null > /tmp/artifact-url.txt

curl -L -H "Authorization: Bearer $GITHUB_TOKEN" \
  -o /tmp/raipple-saas.zip "$(cat /tmp/artifact-url.txt)"

# 2. Extract to temp directory
echo "Extracting..."
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"
unzip -q /tmp/raipple-saas.zip -d "$TMP_DIR"
rm /tmp/raipple-saas.zip /tmp/artifact-url.txt

# Decompress inner tarball
tar xzf "$TMP_DIR"/raipple-saas.tar.gz -C "$TMP_DIR"
rm "$TMP_DIR"/raipple-saas.tar.gz

# 3. Preserve persistent data
echo "Preserving data and skills..."
if [ -d "$APP_DIR/data" ]; then
  cp -r "$APP_DIR/data" "$TMP_DIR/"
fi
if [ -d "$APP_DIR/skills" ]; then
  cp -r "$APP_DIR/skills" "$TMP_DIR/"
fi

# 4. Swap app directory
echo "Deploying new version..."
APP_BACKUP="/opt/raipple/.app-backup"
rm -rf "$APP_BACKUP"
[ -d "$APP_DIR" ] && mv "$APP_DIR" "$APP_BACKUP"
mv "$TMP_DIR" "$APP_DIR"

# 5. Ensure persistent directories exist
mkdir -p "$DATA_DIR" "$SKILLS_DIR"

# 6. Restart service
echo "Restarting service..."
if systemctl is-active --quiet clausr-app 2>/dev/null; then
  sudo systemctl restart clausr-app
  sudo systemctl status clausr-app --no-pager
else
  echo "WARNING: clausr-app service not found. Start manually:"
  echo "  node $APP_DIR/server.js"
fi

echo "Deploy complete."
