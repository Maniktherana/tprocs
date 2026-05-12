import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { PaneService, PaneServiceLive } from "../src/services/pane";
import {
  ProcessManager,
  ProcessManagerLive,
} from "../src/services/process-manager";
import { PtyLive } from "../src/services/pty/service";
import { RendererBridge, RendererBridgeLive } from "../src/services/renderer-bridge";
import { TerminalEngineLive } from "../src/services/terminal-engine";
import { TerminalStateLive } from "../src/services/terminal-state";

const TerminalStateProvided = TerminalStateLive.pipe(
  Layer.provide(TerminalEngineLive),
);
const baseLayers = Layer.mergeAll(PtyLive, TerminalStateProvided, PaneServiceLive);
const pmLayer = ProcessManagerLive.pipe(
  Layer.provide(PtyLive),
  Layer.provide(TerminalStateProvided),
);
const bridgeLayer = RendererBridgeLive.pipe(
  Layer.provide(pmLayer),
  Layer.provide(PaneServiceLive),
  Layer.provide(PtyLive),
  Layer.provide(TerminalStateProvided),
);

const layers = Layer.mergeAll(baseLayers, pmLayer, bridgeLayer);

const run = <A>(
  eff: Effect.Effect<A, never, ProcessManager | PaneService | RendererBridge>,
): Promise<A> =>
  Effect.runPromise(Effect.scoped(eff.pipe(Effect.provide(layers))));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("RendererBridge", () => {
  it("coalesces many mutations into a single tick within a frame", () =>
    run(
      Effect.gen(function* () {
        const pm = yield* ProcessManager;
        const bridge = yield* RendererBridge;
        const startTick = bridge.getTick();

        yield* pm.add({
          autostart: false,
          name: "a",
          cmd: { shell: "true" },
          cols: 80,
          rows: 24,
        });
        yield* pm.add({
          autostart: false,
          name: "b",
          cmd: { shell: "true" },
          cols: 80,
          rows: 24,
        });
        yield* pm.add({
          autostart: false,
          name: "c",
          cmd: { shell: "true" },
          cols: 80,
          rows: 24,
        });

        // Pre-flush: tick unchanged (haven't yielded to setImmediate yet).
        expect(bridge.getTick()).toBe(startTick);
        // Wait through both the leading-edge flush (~next microtask) and the
        // trailing-edge flush (~16ms later): bridge fires at most twice for
        // a burst of bumps — one leading, one trailing.
        yield* Effect.promise(() => wait(40));
        expect(bridge.getTick()).toBeGreaterThanOrEqual(startTick + 1);
        expect(bridge.getTick()).toBeLessThanOrEqual(startTick + 2);
      }),
    ));

  it("invokes subscribers on each flush", () =>
    run(
      Effect.gen(function* () {
        const pane = yield* PaneService;
        const bridge = yield* RendererBridge;
        let fires = 0;
        const unsub = bridge.subscribe(() => {
          fires++;
        });

        // One bump → leading flush fires (no trailing because no more bumps).
        pane.setTerminalSize(120, 40);
        yield* Effect.promise(() => wait(40));
        expect(fires).toBe(1);

        // Burst of three bumps: leading flush fires, then trailing fires
        // after the 16ms window because there were bumps DURING the window.
        // Total ≥ previous + 1, ≤ previous + 2.
        pane.toggleFocus();
        pane.toggleFocus();
        pane.toggleZoom();
        yield* Effect.promise(() => wait(40));
        expect(fires).toBeGreaterThanOrEqual(2);
        expect(fires).toBeLessThanOrEqual(3);
        unsub();
      }),
    ));
});
