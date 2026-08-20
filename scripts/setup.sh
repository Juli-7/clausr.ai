#!/usr/bin/env bash
# Idempotent VPS setup for Clausr AI — safe to run on every deploy
# Native build deps are NOT needed — pnpm install uses --ignore-scripts
set -euo pipefail

PROVISIONED_FLAG=/opt/raipple/.provisioned
REPO_DIR=/opt/raipple/raipple-saas
DATA_DIR=/opt/raipple/data

if [ -f "$PROVISIONED_FLAG" ]; then
  echo "[setup] Already provisioned"
else
  echo "[setup] First-time provisioning"

  # Node.js
  if ! command -v node &>/dev/null; then
    if command -v apt-get &>/dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
      apt-get install -y nodejs
    elif command -v dnf &>/dev/null; then
      curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
      dnf install -y nodejs
    fi
  fi

  # pnpm
  if ! command -v pnpm &>/dev/null; then
    corepack enable && corepack prepare pnpm@latest --activate
  fi

  # clausr user
  if ! id clausr &>/dev/null; then
    useradd -r -s /usr/sbin/nologin clausr
  fi

  touch "$PROVISIONED_FLAG"
  echo "[setup] First-time provisioning complete"
fi

# Packs dir (always — seed manually via scripts/seed-packs.sh)
PACKS_DIR=/opt/raipple/packs
mkdir -p "$PACKS_DIR"
chown clausr:clausr "$PACKS_DIR"

# Data dir (always)
mkdir -p "$DATA_DIR"

# Data symlink (always — fixes missing symlink after bad pull)
if [ -L "$REPO_DIR/apps/clausr/data" ]; then
  target=$(readlink "$REPO_DIR/apps/clausr/data")
  if [ "$target" != "../../data" ]; then
    rm "$REPO_DIR/apps/clausr/data"
    ln -sf ../../data "$REPO_DIR/apps/clausr/data"
  fi
elif [ -e "$REPO_DIR/apps/clausr/data" ]; then
  rm -rf "$REPO_DIR/apps/clausr/data"
  ln -sf ../../data "$REPO_DIR/apps/clausr/data"
else
  ln -sf ../../data "$REPO_DIR/apps/clausr/data"
fi

# Systemd service
cp "$REPO_DIR/deploy/clausr-app.service" /etc/systemd/system/clausr-app.service
chown clausr:clausr "$DATA_DIR"
echo "[setup] Done"
