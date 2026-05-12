import { Context, Effect, Layer } from "effect";
import { PaneService } from "./pane";
import { ProcessManager } from "./process-manager";

export type RendererBridgeShape = {
  readonly getTick: () => number;
  readonly subscribe: (cb: () => void) => () => void;
  readonly bump: () => void;
};

export class RendererBridge extends Context.Tag("RendererBridge")<
  RendererBridge,
  RendererBridgeShape
>() {}

const FRAME_MS = 16;

export const RendererBridgeLive = Layer.scoped(
  RendererBridge,
  Effect.gen(function* () {
    const pm = yield* ProcessManager;
    const pane = yield* PaneService;

    let tick = 0;
    /**
     * State machine:
     *   "idle"     — no event in this window; next bump flushes immediately
     *                via setImmediate (next microtask), keeping latency
     *                ~sub-millisecond for sparse events like `tree`.
     *   "leading"  — a leading-edge flush is queued; further bumps no-op.
     *   "trailing" — leading flush ran; we're inside the 16ms window
     *                holding back further flushes. After the window we
     *                either flush again (if a bump occurred during it) or
     *                go back to "idle".
     */
    let state: "idle" | "leading" | "trailing" = "idle";
    let pending = false;
    const listeners = new Set<() => void>();

    const fire = () => {
      tick++;
      for (const l of listeners) l();
    };

    const trailingTimeout = () => {
      if (pending) {
        pending = false;
        fire();
        state = "trailing";
        setTimeout(trailingTimeout, FRAME_MS);
        return;
      }
      state = "idle";
    };

    const bump = () => {
      if (state === "idle") {
        state = "leading";
        setImmediate(() => {
          fire();
          state = "trailing";
          setTimeout(trailingTimeout, FRAME_MS);
        });
        return;
      }
      pending = true;
    };

    const unsubPm = pm.subscribe(bump);
    const unsubPane = pane.subscribe(bump);
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        unsubPm();
        unsubPane();
        listeners.clear();
      }),
    );

    return {
      getTick: () => tick,
      subscribe: (cb) => {
        listeners.add(cb);
        return () => {
          listeners.delete(cb);
        };
      },
      bump,
    };
  }),
);
