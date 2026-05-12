import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { PaneService, PaneServiceLive } from "../src/services/pane";

const run = <A>(eff: Effect.Effect<A, never, PaneService>): Promise<A> =>
  Effect.runPromise(eff.pipe(Effect.provide(PaneServiceLive)));

describe("PaneService", () => {
  it("splits the terminal into procs list, output, keymap bar (default)", () =>
    run(
      Effect.gen(function* () {
        const p = yield* PaneService;
        p.setTerminalSize(120, 40);
        const l = p.layout();
        expect(l.procsList).toEqual({ x: 0, y: 0, width: 30, height: 37 });
        expect(l.output).toEqual({ x: 30, y: 0, width: 90, height: 37 });
        expect(l.keymap).toEqual({ x: 0, y: 37, width: 120, height: 3 });
        expect(l.zoom).toBe(false);
      }),
    ));

  it("zoom hides the procs list and gives the full width to the output", () =>
    run(
      Effect.gen(function* () {
        const p = yield* PaneService;
        p.setTerminalSize(120, 40);
        p.toggleZoom();
        const l = p.layout();
        expect(l.procsList.width).toBe(0);
        expect(l.output).toEqual({ x: 0, y: 0, width: 120, height: 37 });
        expect(l.zoom).toBe(true);
      }),
    ));

  it("toggleKeymap reclaims the bottom 3 rows for content", () =>
    run(
      Effect.gen(function* () {
        const p = yield* PaneService;
        p.setTerminalSize(120, 40);
        p.toggleKeymap();
        const l = p.layout();
        expect(l.keymap.height).toBe(0);
        expect(l.output.height).toBe(40);
      }),
    ));

  it("toggleFocus flips between procs and output; subscribe fires", () =>
    run(
      Effect.gen(function* () {
        const p = yield* PaneService;
        let ticks = 0;
        const unsub = p.subscribe(() => {
          ticks++;
        });
        expect(p.focus()).toBe("procs");
        p.toggleFocus();
        expect(p.focus()).toBe("output-interactive");
        p.toggleFocus();
        expect(p.focus()).toBe("procs");
        expect(ticks).toBe(2);
        unsub();
      }),
    ));
});
