import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import {
  ProcessManager,
  ProcessManagerLive,
  type ProcSpec,
} from "../src/services/process-manager";
import { PtyLive } from "../src/services/pty/service";
import { TerminalEngineLive } from "../src/services/terminal-engine";
import { TerminalStateLive } from "../src/services/terminal-state";

const TerminalStateProvided = TerminalStateLive.pipe(
  Layer.provide(TerminalEngineLive),
);

const layers = Layer.mergeAll(
  PtyLive,
  TerminalStateProvided,
  ProcessManagerLive.pipe(
    Layer.provide(PtyLive),
    Layer.provide(TerminalStateProvided),
  ),
);

const run = <A>(eff: Effect.Effect<A, never, ProcessManager>): Promise<A> =>
  Effect.runPromise(Effect.scoped(eff.pipe(Effect.provide(layers))));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isNoSuchProcess = (err: unknown): err is NodeJS.ErrnoException =>
  err instanceof Error &&
  "code" in err &&
  (err as NodeJS.ErrnoException).code === "ESRCH";

const processExists = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (isNoSuchProcess(err)) return false;
    throw err;
  }
};

const waitUntil = async (predicate: () => boolean) => {
  for (const _ of Array.from({ length: 50 })) {
    if (predicate()) return;
    await wait(20);
  }
  throw new Error("timed out waiting for condition");
};

const baseSpec = (overrides: Partial<ProcSpec> = {}): ProcSpec => ({
  cmd: { shell: "printf hello" },
  cols: 80,
  rows: 24,
  ...overrides,
});

describe("ProcessManager", () => {
  it("add with autostart spawns the proc; exits cleanly", () =>
    run(
      Effect.gen(function* () {
        const pm = yield* ProcessManager;
        const id = yield* pm.add(baseSpec({ name: "echo" }));
        expect(pm.procs().length).toBe(1);
        expect(pm.current()?.id).toBe(id);
        const state = pm.get(id)!;
        expect(state.status.kind).toBe("running");
        yield* Effect.promise(() => state.session!.handle.exit);
        yield* Effect.sleep("20 millis");
        expect(state.status.kind).toBe("exited");
        if (state.status.kind === "exited") {
          expect(state.status.exitCode).toBe(0);
        }
      }),
    ));

  it("add with autostart=false stays idle until start() is called", () =>
    run(
      Effect.gen(function* () {
        const pm = yield* ProcessManager;
        const id = yield* pm.add(baseSpec({ autostart: false, name: "manual" }));
        expect(pm.get(id)!.status.kind).toBe("idle");
        yield* pm.start(id);
        expect(pm.get(id)!.status.kind).toBe("running");
      }),
    ));

  it("stop sends SIGTERM and the proc transitions to exited", () =>
    run(
      Effect.gen(function* () {
        const pm = yield* ProcessManager;
        const id = yield* pm.add(
          baseSpec({
            cmd: { shell: "while true; do printf x; sleep 0.05; done" },
          }),
        );
        yield* Effect.promise(() => wait(100));
        yield* pm.stop(id);
        const state = pm.get(id)!;
        yield* Effect.promise(() => state.session!.handle.exit);
        yield* Effect.sleep("20 millis");
        expect(state.status.kind).toBe("exited");
      }),
    ));

  it("kill sends a real SIGKILL to the child pid", () =>
    run(
      Effect.gen(function* () {
        const pm = yield* ProcessManager;
        const id = yield* pm.add(
          baseSpec({
            cmd: {
              shell:
                "trap '' TERM HUP INT QUIT; printf ready; while :; do read -t 1 _ || true; done",
            },
          }),
        );
        yield* Effect.promise(() => wait(100));
        const state = pm.get(id)!;
        const pid = state.session!.handle.pid;
        expect(processExists(pid)).toBe(true);
        yield* pm.kill(id);
        yield* Effect.promise(() => waitUntil(() => !processExists(pid)));
      }),
    ));

  it("pause + resume toggles SIGSTOP/SIGCONT on Unix backends", () =>
    run(
      Effect.gen(function* () {
        const pm = yield* ProcessManager;
        if (!pm.supportsSignals) return;
        const id = yield* pm.add(
          baseSpec({
            cmd: { shell: "while true; do printf x; sleep 0.05; done" },
          }),
        );
        yield* Effect.promise(() => wait(80));
        yield* pm.pause(id);
        expect(pm.get(id)!.status.kind).toBe("paused");
        yield* pm.resume(id);
        expect(pm.get(id)!.status.kind).toBe("running");
        yield* pm.kill(id);
        yield* Effect.promise(() => pm.get(id)!.session!.handle.exit);
      }),
    ));

  it("rename updates the display name; subscribe fires on mutations", () =>
    run(
      Effect.gen(function* () {
        const pm = yield* ProcessManager;
        let ticks = 0;
        const unsub = pm.subscribe(() => {
          ticks++;
        });
        const id = yield* pm.add(baseSpec({ name: "old", autostart: false }));
        expect(pm.get(id)!.name).toBe("old");
        yield* pm.rename(id, "new");
        expect(pm.get(id)!.name).toBe("new");
        expect(ticks).toBeGreaterThan(0);
        unsub();
      }),
    ));

  it("selectNext / selectPrev / selectIndex walk the proc list", () =>
    run(
      Effect.gen(function* () {
        const pm = yield* ProcessManager;
        const a = yield* pm.add(baseSpec({ name: "a", autostart: false }));
        const b = yield* pm.add(baseSpec({ name: "b", autostart: false }));
        const c = yield* pm.add(baseSpec({ name: "c", autostart: false }));

        expect(pm.currentId()).toBe(a);
        pm.selectNext();
        expect(pm.currentId()).toBe(b);
        pm.selectNext();
        expect(pm.currentId()).toBe(c);
        pm.selectNext();
        expect(pm.currentId()).toBe(c); // clamped at end
        pm.selectPrev();
        expect(pm.currentId()).toBe(b);
        pm.selectIndex(0);
        expect(pm.currentId()).toBe(a);
      }),
    ));
});
