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
        // procs list + 1-col resize handle + output, 1-row statusline.
        expect(l.procsList).toEqual({ x: 0, y: 0, width: 32, height: 39 });
        expect(l.output).toEqual({ x: 33, y: 0, width: 87, height: 39 });
        expect(l.keymap).toEqual({ x: 0, y: 39, width: 120, height: 1 });
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
        expect(l.output).toEqual({ x: 0, y: 0, width: 120, height: 39 });
        expect(l.zoom).toBe(true);
      }),
    ));

  it("toggleKeymap reclaims the statusline row for content", () =>
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

  it("setProcsListWidth clamps to [14, 60% of cols] and notifies subscribers", () =>
    run(
      Effect.gen(function* () {
        const p = yield* PaneService;
        let ticks = 0;
        const unsub = p.subscribe(() => {
          ticks++;
        });
        p.setTerminalSize(100, 40);
        ticks = 0;
        p.setProcsListWidth(10);
        expect(p.procsListWidth()).toBe(14);
        p.setProcsListWidth(80);
        expect(p.procsListWidth()).toBe(60);
        p.setProcsListWidth(40);
        expect(p.procsListWidth()).toBe(40);
        expect(ticks).toBeGreaterThan(0);
        unsub();
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
