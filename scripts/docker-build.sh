# Build: docker buildx build -t raipple-saas:latest -f ../raipple-saas/Dockerfile ..
# Context must be /Users/7ian/ (parent of both raipple-saas and clausr.ai)

set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
docker buildx build \
  -t raipple-saas:latest \
  -f "$DIR/Dockerfile" \
  "$DIR/.." \
  "$@"
