import { Context, Effect, Layer } from "effect";
import { Ghostty } from "../ghostty";

/**
 * Owns the single `Ghostty` WASM instance for the lifetime of the runtime.
 *
 * Loading `Ghostty.load()` decodes ~400 KB of wasm and instantiates a
 * WebAssembly module — non-trivial latency that we MUST pay before any
 * terminal session is spawned, otherwise the first PTY chunk stalls behind
 * the wasm-init promise.
 *
 * Modeled as an Effect service so the dependency graph enforces ordering:
 * `TerminalState` (and anything else that creates terminals) provides this
 * tag, which means `Layer.scoped` resolution will complete `load()` before
 * those consumers come online. No ad-hoc module-scope memoization.
 */
export class TerminalEngine extends Context.Tag("TerminalEngine")<
  TerminalEngine,
  {
    readonly ghostty: Ghostty;
  }
>() {}

export const TerminalEngineLive = Layer.scoped(
  TerminalEngine,
  Effect.gen(function* () {
    const ghostty = yield* Effect.promise(() => Ghostty.load());
    return { ghostty };
  }),
);
