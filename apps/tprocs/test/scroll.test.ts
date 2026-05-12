import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import {
  ProcessManager,
  ProcessManagerLive,
} from "../src/services/process-manager";
import { PtyLive } from "../src/services/pty/service";
import { TerminalEngineLive } from "../src/services/terminal-engine";
import { TerminalStateLive } from "../src/services/terminal-state";

const TerminalStateProvided = TerminalStateLive.pipe(
  Layer.provide(TerminalEngineLive),
);
const layers = ProcessManagerLive.pipe(
  Layer.provide(PtyLive),
  Layer.provide(TerminalStateProvided),
);

const run = <A>(eff: Effect.Effect<A, never, ProcessManager>): Promise<A> =>
  Effect.runPromise(Effect.scoped(eff.pipe(Effect.provide(layers))));

describe("ProcessManager scroll model", () => {
  it("scrollUp drops followTail; scrollDown to 0 re-engages it", () =>
    run(
      Effect.gen(function* () {
        const pm = yield* ProcessManager;
        const id = yield* pm.add({
          autostart: true,
          name: "scroll",
          cmd: { shell: "printf 'a\\nb\\nc\\n'" },
          cols: 80,
          rows: 24,
        });
        const state = pm.get(id)!;
        yield* Effect.promise(() => state.session!.handle.exit);

        // Initial view is anchored to the tail.
        expect(state.view.followTail).toBe(true);
        expect(state.view.viewOffset).toBe(0);

        pm.scrollUp(id, 1);
        expect(state.view.followTail).toBe(false);
        expect(state.view.viewOffset).toBeGreaterThanOrEqual(0);

        pm.scrollDown(id, 999);
        expect(state.view.followTail).toBe(true);
        expect(state.view.viewOffset).toBe(0);
      }),
    ));

  it("scrollUp is clamped to the available scrollback", () =>
    run(
      Effect.gen(function* () {
        const pm = yield* ProcessManager;
        const id = yield* pm.add({
          autostart: true,
          name: "clamp",
          cmd: { shell: "printf 'a\\n'" },
          cols: 80,
          rows: 24,
        });
        const state = pm.get(id)!;
        yield* Effect.promise(() => state.session!.handle.exit);
        pm.scrollUp(id, 9999);
        expect(state.view.viewOffset).toBeLessThanOrEqual(
          state.session!.terminal.scrollbackCount,
        );
      }),
    ));
});
