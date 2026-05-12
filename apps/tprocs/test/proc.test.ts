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
    await Effect.runPromise(Scope.close(scope, Exit.void));
    expect((await proc.exit).signal).toBe("SIGTERM");
  });
});
