#!/usr/bin/env bash
# Seed default compliance packs from git source to PACKS_DIR
# Usage: bash scripts/seed-packs.sh [--force]
#   --force: overwrite existing packs
set -euo pipefail

REPO_DIR=/opt/raipple/raipple-saas
PACKS_DIR=${PACKS_DIR:-/opt/raipple/packs}
SEED_SOURCE="$REPO_DIR/apps/clausr/packs"

DEFAULT_PACKS=("datasec-gb44464" "datasec-gdpr" "eu-md-doc" "ai-synthetic-label")

FORCE=false
[[ "${1:-}" == "--force" ]] && FORCE=true

echo "[seed-packs] PACKS_DIR=$PACKS_DIR${FORCE:+" (--force)"}"
mkdir -p "$PACKS_DIR"

seeded=0
skipped=0
for pack in "${DEFAULT_PACKS[@]}"; do
  if ! [ -d "$SEED_SOURCE/$pack" ]; then
    echo "  MISS  $pack (source not found at $SEED_SOURCE/$pack)"
    continue
  fi
  if $FORCE || ! [ -f "$PACKS_DIR/$pack/pack.json" ]; then
    rm -rf "$PACKS_DIR/$pack"
    cp -r "$SEED_SOURCE/$pack" "$PACKS_DIR/"
    echo "  SEED  $pack"
    seeded=$((seeded + 1))
  else
    echo "  SKIP  $pack (already exists, use --force to overwrite)"
    skipped=$((skipped + 1))
  fi
done

echo "[seed-packs] Done: $seeded seeded, $skipped skipped"
