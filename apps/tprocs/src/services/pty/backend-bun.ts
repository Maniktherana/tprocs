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
import { PtySpawnError } from "./backend";

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

const TERM_GRACE_MS = 500;
const KILL_GRACE_MS = 100;

const waitForExit = (
  exit: Promise<PtyExit>,
  ms: number,
): Promise<boolean> =>
  Promise.race([exit.then(() => true), Bun.sleep(ms).then(() => false)]);

const terminatePty = (
  pty: ReturnType<typeof bunSpawn>,
  exit: Promise<PtyExit>,
): Effect.Effect<void> =>
  Effect.promise(async () => {
    signalPty(pty, "SIGTERM");
    if (await waitForExit(exit, TERM_GRACE_MS)) return;
    signalPty(pty, "SIGKILL");
    pty.kill("SIGKILL");
    await waitForExit(exit, KILL_GRACE_MS);
  });

const spawnImpl = (
  spec: PtySpec,
  size: PtySize,
): Effect.Effect<PtyHandle, PtySpawnError, Scope.Scope> =>
  Effect.gen(function* () {
    const { pty, exit } = yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          const pty = bunSpawn(spec.file, [...spec.args], {
            name: spec.term ?? "xterm-256color",
            cols: size.cols,
            rows: size.rows,
            cwd: spec.cwd ?? process.cwd(),
            env: spec.env ?? (process.env as Record<string, string>),
          });
          let exitSub: { dispose: () => void } | undefined;
          const exit = new Promise<PtyExit>((resolve) => {
            exitSub = pty.onExit((event) => {
              exitSub?.dispose();
              resolve(event);
            });
          });
          return { pty, exit };
        },
        catch: (cause) => new PtySpawnError(spec, cause),
      }),
      ({ pty, exit }) => terminatePty(pty, exit),
    );

    const data = Stream.async<string>((emit) => {
      let active = true;
      const dataSub = pty.onData((d) => emit.single(d));
      exit.then(() => {
        if (active) emit.end();
      });
      return Effect.sync(() => {
        active = false;
        dataSub.dispose();
      });
    }, 1024);

    return {
      pid: pty.pid,
      data,
      exit,
      write: (d) => Effect.sync(() => pty.write(d)),
      resize: (c, r) => Effect.sync(() => pty.resize(c, r)),
      signal: (sig) => Effect.sync(() => signalPty(pty, sig)),
    };
  });

export const PtyBackendBun: PtyBackend = {
  supportsSignals: process.platform !== "win32",
  spawn: spawnImpl,
};
