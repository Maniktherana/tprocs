import { Context, Effect, Layer, Scope } from "effect";
import { Terminal, type TerminalOptions } from "../terminal";
import { TerminalEngine } from "./terminal-engine";

export type ProcId = string;

export type TerminalEntry = { procId: ProcId; terminal: Terminal };

export class TerminalState extends Context.Tag("TerminalState")<
  TerminalState,
  {
    readonly attach: (
      procId: ProcId,
      opts: TerminalOptions,
    ) => Effect.Effect<Terminal, never, Scope.Scope>;
    readonly get: (procId: ProcId) => Terminal | undefined;
    readonly entries: () => readonly TerminalEntry[];
  }
>() {}

export const TerminalStateLive = Layer.scoped(
  TerminalState,
  Effect.gen(function* () {
    const engine = yield* TerminalEngine;
    const terminals = new Map<ProcId, Terminal>();
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        terminals.clear();
      }),
    );

    return {
      attach: (procId, opts) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const term = Terminal.create(engine.ghostty, opts);
            terminals.set(procId, term);
            return term;
          }),
          () =>
            Effect.sync(() => {
              terminals.delete(procId);
            }),
        ),
      get: (procId) => terminals.get(procId),
      entries: () =>
        Array.from(terminals, ([procId, terminal]) => ({ procId, terminal })),
    };
  }),
);
