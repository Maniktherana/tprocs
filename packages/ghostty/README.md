# packages/ghostty

Pinned [ghostty-org/ghostty](https://github.com/ghostty-org/ghostty) source tree
plus the patch + build script that produces `ghostty-vt.wasm` (the VT100/ANSI
parser compiled to WebAssembly).

## Layout

```
packages/ghostty/
  upstream/                          ← ghostty submodule, pinned at 5714ed07a
  patches/
    lib-vt-wasm-api.patch            ← adds the C-ABI exposed by `zig build lib-vt`
  scripts/
    build-wasm.sh                    ← applies patch + builds wasm + reverts patch
```

The actual wasm artifact is committed at
`apps/tprocs/src/ghostty/ghostty-vt.wasm` (it's the tprocs binary's embedded
asset), alongside the hand-written TypeScript bindings.

## Pins

| project              | commit         | why                                           |
| -------------------- | -------------- | --------------------------------------------- |
| ghostty-org/ghostty  | `5714ed07a`    | matches coder/ghostty-web 0.4.0's pin         |

The `lib-vt-wasm-api.patch` is the same patch shipped by
`coder/ghostty-web@03ead6e1`, MIT-licensed. It exposes
`ghostty_terminal_*` / `ghostty_render_state_*` / `ghostty_key_*` symbols
that the bindings in `apps/tprocs/src/ghostty/` call into.

## Building the wasm

Requires Zig 0.15.2+ on PATH (`brew install zig` on macOS).

```bash
bash packages/ghostty/scripts/build-wasm.sh
```

The script:

1. Ensures the submodule is checked out at the pinned commit.
2. Applies `patches/lib-vt-wasm-api.patch` to the submodule working tree.
3. Runs `zig build lib-vt -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall`.
4. Copies `zig-out/bin/ghostty-vt.wasm` →
   `apps/tprocs/src/ghostty/ghostty-vt.wasm`.
5. Reverts the patch so the submodule stays pristine.

Most contributors don't need to run this — the produced wasm is checked in.

## Bumping the pin

```bash
cd packages/ghostty/upstream
git fetch && git checkout <new-commit>
cd ../../..
# patch may need updating if ghostty's internal Terminal API changed
bash packages/ghostty/scripts/build-wasm.sh
git add packages/ghostty/upstream apps/tprocs/src/ghostty/ghostty-vt.wasm
```

## Licensing

- `upstream/` — Ghostty contributors, MIT
- `patches/lib-vt-wasm-api.patch` — Coder, Inc., MIT (extracted from
  coder/ghostty-web)
- `scripts/build-wasm.sh` — this repo, MIT
- The produced `ghostty-vt.wasm` inherits Ghostty's MIT license.
