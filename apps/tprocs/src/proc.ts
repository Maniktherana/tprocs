import { Effect, Scope, Stream } from "effect";
import {
  Pty,
  type PtyExit,
  type PtyHandle,
  type PtySpawnError,
} from "./services/pty/service";
import { TerminalEngine } from "./services/terminal-engine";
import { Terminal } from "./terminal";

export type Argv = readonly [string, ...string[]];
export type CmdSpec = { readonly shell: string } | { readonly argv: Argv };

export type ProcConfig = {
  readonly id: string;
  readonly name: string;
  readonly cmd: CmdSpec;
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly cols: number;
  readonly rows: number;
  readonly scrollbackLimit?: number;
};

export type ProcHandle = {
  readonly config: ProcConfig;
  readonly term: Terminal;
  readonly pty: PtyHandle;
  readonly exit: Promise<PtyExit>;
  readonly write: (data: string) => Effect.Effect<void>;
  readonly resize: (cols: number, rows: number) => Effect.Effect<void>;
};

const argvOf = (cmd: CmdSpec): { file: string; args: readonly string[] } =>
  "shell" in cmd
    ? { file: "bash", args: ["-lc", cmd.shell] }
    : { file: cmd.argv[0], args: cmd.argv.slice(1) };

export const startProc = (
  config: ProcConfig,
): Effect.Effect<ProcHandle, PtySpawnError, Scope.Scope | Pty | TerminalEngine> =>
  Effect.gen(function* () {
    const pty = yield* Pty;
    const engine = yield* TerminalEngine;
    const term = yield* Effect.acquireRelease(
      Effect.sync(() =>
        Terminal.create(engine.ghostty, {
          cols: config.cols,
          rows: config.rows,
          scrollbackLimit: config.scrollbackLimit,
        }),
      ),
      (terminal) => Effect.sync(() => terminal.dispose()),
    );
    const { file, args } = argvOf(config.cmd);
    const handle = yield* pty.spawn(
      { file, args, cwd: config.cwd, env: config.env },
      { cols: config.cols, rows: config.rows },
    );

    let resolveDrain!: () => void;
    const drainFinished = new Promise<void>((r) => {
      resolveDrain = r;
    });
    yield* Effect.forkScoped(
      Stream.runForEach(handle.data, (d) =>
        Effect.sync(() => term.feed(d)),
      ).pipe(Effect.ensuring(Effect.sync(() => resolveDrain()))),
    );

    return {
      config,
      term,
      pty: handle,
      exit: drainFinished.then(() => handle.exit),
      write: handle.write,
      resize: (c, r) =>
        Effect.zipRight(
          handle.resize(c, r),
          Effect.sync(() => term.resize(c, r)),
        ),
    };
  });
