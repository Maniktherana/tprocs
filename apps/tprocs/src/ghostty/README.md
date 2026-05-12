# ghostty (bindings + wasm artifact)

In-tree Bun bindings to **libghostty-vt** (Ghostty's terminal parser compiled
to WebAssembly).

## Layout

| file                  | source                                                                |
| --------------------- | --------------------------------------------------------------------- |
| `types.ts`            | Vendored from `coder/ghostty-web @ 03ead6e1` `lib/types.ts` (MIT)     |
| `ghostty.ts`          | Adapted from `coder/ghostty-web @ 03ead6e1` `lib/ghostty.ts` (MIT)    |
| `ghostty-vt.wasm`     | Built from `ghostty-org/ghostty @ 5714ed07` (the commit pinned by    |
|                       | coder/ghostty-web at 03ead6e1) via `zig build lib-vt`                 |
| `index.ts`            | Public re-exports                                                     |

The pristine upstream is mirrored as a git submodule at
`<repo>/packages/ghostty` for reproducibility — you don't need it at runtime,
only if you want to rebuild the wasm.

## Distribution

`tprocs` ships as a single Bun-compiled binary (`bun build --compile`). The
wasm asset is imported via `import wasmPath from "./ghostty-vt.wasm" with
{ type: "file" }`, which Bun bakes into the binary alongside the JS.

## Regenerating `ghostty-vt.wasm` from source

Requires Zig 0.15.2+.

```bash
git submodule update --init --recursive
(cd packages/ghostty && bash scripts/build-wasm.sh)
cp packages/ghostty/ghostty-vt.wasm apps/tprocs/src/ghostty/
```

The wasm is otherwise treated as a checked-in build artifact, identical to
what `coder/ghostty-web` publishes on npm at the pinned commit.

## Licensing

- `types.ts` / `ghostty.ts`: MIT (Coder, Inc.)
- `ghostty-vt.wasm`: MIT (Ghostty contributors). Same Ghostty source, compiled
  to wasm via Coder's `lib-vt` patch.
