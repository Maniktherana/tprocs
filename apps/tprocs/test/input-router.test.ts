import type { KeyEvent } from "@opentui/core";
import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { InputRouter, InputRouterLive } from "../src/services/input-router";
import { PaneService, PaneServiceLive } from "../src/services/pane";
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
const baseDeps = Layer.mergeAll(PtyLive, TerminalStateProvided);
const mid = Layer.mergeAll(ProcessManagerLive, PaneServiceLive).pipe(
  Layer.provide(baseDeps),
);
const layers = InputRouterLive.pipe(Layer.provideMerge(mid));

const run = <A>(
  eff: Effect.Effect<A, never, InputRouter | PaneService | ProcessManager>,
): Promise<A> =>
  Effect.runPromise(Effect.scoped(eff.pipe(Effect.provide(layers))));

const keyEvent = (overrides: Partial<KeyEvent>): KeyEvent =>
  ({
    name: "",
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    sequence: "",
    raw: "",
    eventType: "press",
    source: "raw",
    number: false,
    ...overrides,
  }) as KeyEvent;

describe("InputRouter (procs scope)", () => {
  it("`j` advances proc selection; `k` retreats", () =>
    run(
      Effect.gen(function* () {
        const pm = yield* ProcessManager;
        const router = yield* InputRouter;
        const a = yield* pm.add({
          autostart: false,
          name: "a",
          cmd: { shell: "true" },
          cols: 80,
          rows: 24,
        });
        const b = yield* pm.add({
          autostart: false,
          name: "b",
          cmd: { shell: "true" },
          cols: 80,
          rows: 24,
        });

        yield* router.handleKey(keyEvent({ name: "j" }));
        expect(pm.currentId()).toBe(b);
        yield* router.handleKey(keyEvent({ name: "k" }));
        expect(pm.currentId()).toBe(a);
      }),
    ));

  it("`Ctrl-A` enters interactive mode from procs scope", () =>
    run(
      Effect.gen(function* () {
        const pane = yield* PaneService;
        const router = yield* InputRouter;
        expect(pane.focus()).toBe("procs");
        yield* router.handleKey(keyEvent({ name: "a", ctrl: true }));
        expect(pane.focus()).toBe("output-interactive");
        yield* router.handleKey(keyEvent({ name: "a", ctrl: true }));
        expect(pane.focus()).toBe("procs");
      }),
    ));

  it("`M-2` selects proc by index", () =>
    run(
      Effect.gen(function* () {
        const pm = yield* ProcessManager;
        const router = yield* InputRouter;
        const a = yield* pm.add({
          autostart: false,
          name: "a",
          cmd: { shell: "true" },
          cols: 80,
          rows: 24,
        });
        const b = yield* pm.add({
          autostart: false,
          name: "b",
          cmd: { shell: "true" },
          cols: 80,
          rows: 24,
        });
        const c = yield* pm.add({
          autostart: false,
          name: "c",
          cmd: { shell: "true" },
          cols: 80,
          rows: 24,
        });
        expect(pm.currentId()).toBe(a);
        yield* router.handleKey(keyEvent({ name: "2", meta: true }));
        expect(pm.currentId()).toBe(b);
        yield* router.handleKey(keyEvent({ name: "3", meta: true }));
        expect(pm.currentId()).toBe(c);
      }),
    ));

  it("`s` starts the current (idle) proc", () =>
    run(
      Effect.gen(function* () {
        const pm = yield* ProcessManager;
        const router = yield* InputRouter;
        const id = yield* pm.add({
          autostart: false,
          name: "p",
          cmd: { shell: "sleep 5" },
          cols: 80,
          rows: 24,
        });
        expect(pm.get(id)!.status.kind).toBe("idle");
        yield* router.handleKey(keyEvent({ name: "s" }));
        expect(pm.get(id)!.status.kind).toBe("running");
        yield* pm.kill(id);
      }),
    ));

  it("`z` toggles zoom on the output pane", () =>
    run(
      Effect.gen(function* () {
        const pane = yield* PaneService;
        const router = yield* InputRouter;
        expect(pane.zoom()).toBe(false);
        yield* router.handleKey(keyEvent({ name: "z" }));
        expect(pane.zoom()).toBe(true);
      }),
    ));
});

describe("InputRouter (output-interactive scope)", () => {
  it("forwards unbound keys to the focused proc's PTY", () =>
    run(
      Effect.gen(function* () {
        const pm = yield* ProcessManager;
        const pane = yield* PaneService;
        const router = yield* InputRouter;
        // `head -c 2` exits as soon as it has read two bytes from stdin —
        // a clean signal that our forwarded keystrokes reached the PTY.
        const id = yield* pm.add({
          autostart: true,
          name: "head",
          cmd: { shell: "head -c 2 >/dev/null" },
          cols: 80,
          rows: 24,
        });
        pane.setFocus("output-interactive");
        yield* Effect.sleep("80 millis");
        // PTY is in canonical mode; line discipline buffers until newline. We
        // need to send "a\n" (here as "a" then carriage return) for `head` to
        // see the 2 bytes and exit.
        yield* router.handleKey(keyEvent({ name: "a", sequence: "a" }));
        yield* router.handleKey(keyEvent({ name: "return", sequence: "\r" }));
        yield* Effect.promise(() => pm.get(id)!.session!.handle.exit);
        expect(pm.get(id)!.status.kind).toBe("exited");
      }),
    ));

  it("`C-a` exits interactive mode back to procs", () =>
    run(
      Effect.gen(function* () {
        const pane = yield* PaneService;
        const router = yield* InputRouter;
        pane.setFocus("output-interactive");
        yield* router.handleKey(keyEvent({ name: "a", ctrl: true }));
        expect(pane.focus()).toBe("procs");
      }),
    ));
});
