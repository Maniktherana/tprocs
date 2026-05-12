#!/usr/bin/env bash
#
# Builds libghostty-vt as WASM and copies the artifact into the tprocs app.
#
# Pipeline:
#   1. Ensure ghostty submodule is at the pinned commit (5714ed07a).
#   2. Apply patches/lib-vt-wasm-api.patch (adds the C/Wasm ABI for the
#      terminal emulator that ghostty's lib_vt would otherwise lack).
#   3. zig build lib-vt -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall
#   4. Copy zig-out/bin/ghostty-vt.wasm → apps/tprocs/src/ghostty/.
#   5. Revert the patch so the submodule stays pristine.
#
# Requires Zig 0.15.2+ on PATH. The produced wasm is checked into the repo,
# so app contributors do NOT need this script unless they bump the pin.

set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$PKG_DIR/../.." && pwd)"
UPSTREAM="$PKG_DIR/upstream"
PATCH="$PKG_DIR/patches/lib-vt-wasm-api.patch"
OUT_DIR="$REPO_ROOT/apps/tprocs/src/ghostty"
OUT="$OUT_DIR/ghostty-vt.wasm"

if ! command -v zig &>/dev/null; then
  echo "❌ Zig not on PATH. Install Zig 0.15.2+:"
  echo "   brew install zig    # macOS"
  echo "   https://ziglang.org/download/  # other"
  exit 1
fi
echo "▶ Using $(zig version)"

if [ ! -d "$UPSTREAM/.git" ] && [ ! -f "$UPSTREAM/.git" ]; then
  echo "▶ Initialising ghostty submodule"
  git -C "$REPO_ROOT" submodule update --init --recursive packages/ghostty/upstream
fi

PINNED="$(git -C "$REPO_ROOT" submodule status packages/ghostty/upstream | awk '{print $1}' | sed 's/^[-+]//')"
ACTUAL="$(git -C "$UPSTREAM" rev-parse HEAD)"
echo "▶ ghostty pinned   = $PINNED"
echo "▶ ghostty checked  = $ACTUAL"

trap 'echo "▶ Reverting patch"; git -C "$UPSTREAM" apply -R "$PATCH" 2>/dev/null || true; rm -f "$UPSTREAM/include/ghostty/vt/terminal.h" "$UPSTREAM/src/terminal/c/terminal.zig"' EXIT

echo "▶ Applying lib-vt-wasm-api.patch"
git -C "$UPSTREAM" apply --check "$PATCH"
git -C "$UPSTREAM" apply "$PATCH"

echo "▶ Building lib-vt wasm (ReleaseSmall, wasm32-freestanding)"
(
  cd "$UPSTREAM"
  zig build lib-vt -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall
)

mkdir -p "$OUT_DIR"
cp "$UPSTREAM/zig-out/bin/ghostty-vt.wasm" "$OUT"
SIZE="$(du -h "$OUT" | cut -f1)"
echo "✅ Wrote $OUT ($SIZE)"
