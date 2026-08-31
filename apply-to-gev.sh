#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /path/to/gods-eye-view-fork" >&2
  exit 64
fi

TARGET="$(cd "$1" && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -d "$TARGET/.git" ]]; then
  echo "target is not a git repository: $TARGET" >&2
  exit 65
fi

copy_tree() {
  local rel="$1"
  mkdir -p "$TARGET/$rel"
  cp -a "$HERE/$rel/." "$TARGET/$rel/"
}

copy_tree server
copy_tree db/migrations
copy_tree commercial-clean
copy_tree docs

for file in VALIDATION.md PATCH_MANIFEST.md UPSTREAM_BASE.md; do
  cp "$HERE/$file" "$TARGET/$file"
done

# Keep this helper available in the fork for repeatable integration/review.
cp "$HERE/apply-to-gev.sh" "$TARGET/apply-to-gev.sh"
chmod +x "$TARGET/apply-to-gev.sh"

echo "World Intelligence PR1 overlay applied to: $TARGET"
echo "Review with: git status --short && git diff --stat"
