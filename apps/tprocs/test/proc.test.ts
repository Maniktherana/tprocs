import { describe, expect, it } from "bun:test";
import { Effect, Exit, Layer, Scope } from "effect";
import { PtyLive } from "../src/services/pty/service";
import { TerminalEngineLive } from "../src/services/terminal-engine";
import { startProc, type ProcConfig, type ProcHandle } from "../src/proc";

const procDeps = Layer.mergeAll(PtyLive, TerminalEngineLive);

const withProc = (config: ProcConfig, use: (proc: ProcHandle) => Promise<void>): Promise<void> =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const proc = yield* startProc(config);
        yield* Effect.promise(() => use(proc));
      }).pipe(Effect.provide(procDeps)),
    ),
  );

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
  for (const _ of Array.from({ length: 80 })) {
    if (predicate()) return;
    await wait(20);
  }
  throw new Error("timed out waiting for condition");
};

describe("startProc", () => {
  it("spawns a shell command and writes its output into the terminal grid", () =>
    withProc(
      {
        id: "echo",
        name: "echo",
        cmd: { shell: "printf hello-tprocs" },
        cols: 80,
        rows: 24,
      },
      async (proc) => {
        expect((await proc.exit).exitCode).toBe(0);
        const row0 = Array.from({ length: 12 }, (_, c) =>
          String.fromCodePoint(proc.term.cell(0, c).char),
        ).join("");
        expect(row0).toBe("hello-tprocs");
      },
    ));

  it("flips usingAltScreen when the child enters/exits alt-screen mode", () =>
    withProc(
      {
        id: "alt",
        name: "alt",
        cmd: {
          shell: "printf '\\033[?1049h'; sleep 0.05; printf '\\033[?1049l'",
        },
        cols: 80,
        rows: 24,
      },
      async (proc) => {
        await proc.exit;
        expect(proc.term.usingAltScreen).toBe(false);
      },
    ));

  it("scope close terminates the child (SIGTERM)", async () => {
    const scope = await Effect.runPromise(Scope.make());
    const proc = await Effect.runPromise(
      startProc({
        id: "loop",
        name: "loop",
        cmd: { shell: "while true; do printf x; sleep 0.05; done" },
        cols: 80,
        rows: 24,
      }).pipe(Scope.extend(scope), Effect.provide(procDeps)),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(processExists(proc.pty.pid)).toBe(true);
    await Effect.runPromise(Scope.close(scope, Exit.void));
    await waitUntil(() => !processExists(proc.pty.pid));
  });

  it("scope close escalates when the child ignores SIGTERM", async () => {
    const scope = await Effect.runPromise(Scope.make());
    const proc = await Effect.runPromise(
      startProc({
        id: "stubborn",
        name: "stubborn",
        cmd: {
          shell:
            "trap '' TERM HUP INT QUIT; printf ready; while :; do sleep 1; done",
        },
        cols: 80,
        rows: 24,
      }).pipe(Scope.extend(scope), Effect.provide(procDeps)),
    );
    await wait(100);
    expect(processExists(proc.pty.pid)).toBe(true);
    await Effect.runPromise(Scope.close(scope, Exit.void));
    await waitUntil(() => !processExists(proc.pty.pid));
  });
});
