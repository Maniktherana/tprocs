import { spawn as bunSpawn } from "bun-pty";
import { Effect, Scope, Stream } from "effect";
import type {
  PtyBackend,
  PtyExit,
  PtyHandle,
  PtySize,
  PtySignal,
  PtySpec,
} from "./backend";

const isNoSuchProcess = (err: unknown): err is NodeJS.ErrnoException =>
  err instanceof Error &&
  "code" in err &&
  (err as NodeJS.ErrnoException).code === "ESRCH";

const signalPid = (pid: number, sig: PtySignal): void => {
  try {
    process.kill(pid, sig);
  } catch (err) {
    if (isNoSuchProcess(err)) return;
    throw err;
  }
};

const signalPty = (
  pty: ReturnType<typeof bunSpawn>,
  sig: PtySignal,
): void => {
  if (process.platform === "win32") {
    pty.kill(sig);
    return;
  }
  signalPid(pty.pid, sig);
};

const spawnImpl = (
  spec: PtySpec,
  size: PtySize,
): Effect.Effect<PtyHandle, never, Scope.Scope> =>
  Effect.gen(function* () {
    const pty = yield* Effect.acquireRelease(
      Effect.sync(() =>
        bunSpawn(spec.file, [...spec.args], {
          name: spec.term ?? "xterm-256color",
          cols: size.cols,
          rows: size.rows,
          cwd: spec.cwd ?? process.cwd(),
          env: spec.env ?? (process.env as Record<string, string>),
        }),
      ),
      (p) =>
        Effect.sync(() => {
          signalPty(p, "SIGTERM");
          p.kill("SIGTERM");
        }),
    );

    return {
      pid: pty.pid,
      data: Stream.async<string>((emit) => {
        pty.onData((d) => emit.single(d));
        pty.onExit(() => emit.end());
      }, 1024),
      exit: new Promise<PtyExit>((resolve) => pty.onExit(resolve)),
      write: (d) => Effect.sync(() => pty.write(d)),
      resize: (c, r) => Effect.sync(() => pty.resize(c, r)),
      signal: (sig) => Effect.sync(() => signalPty(pty, sig)),
    };
  });

export const PtyBackendBun: PtyBackend = {
  supportsSignals: process.platform !== "win32",
  spawn: spawnImpl,
};
