import { Context, Effect, Either, Exit, Layer, Scope, Stream } from "effect";
import type { PtyHandle } from "./pty/service";
import { Pty } from "./pty/service";
import { TerminalState } from "./terminal-state";
import type { Terminal } from "../terminal";

export type ProcId = string;

export type Argv = readonly [string, ...string[]];
export type CmdSpec = { readonly shell: string } | { readonly argv: Argv };

export type ProcSpec = {
  readonly id?: ProcId;
  readonly name?: string;
  readonly cmd: CmdSpec;
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  readonly cols: number;
  readonly rows: number;
  readonly scrollbackLimit?: number;
  readonly autostart?: boolean;
};

export type ProcStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly pid: number; readonly startedAt: number }
  | { readonly kind: "paused"; readonly pid: number; readonly startedAt: number }
  | { readonly kind: "failed"; readonly message: string }
  | {
      readonly kind: "exited";
      readonly exitCode: number;
      readonly signal?: string;
    };

type Session = {
  scope: Scope.CloseableScope;
  terminal: Terminal;
  handle: PtyHandle;
};

export type ProcView = {
  /** Lines above the tail (0 = at bottom). */
  viewOffset: number;
  /** When true, new output keeps the view pinned to the bottom. */
  followTail: boolean;
};

export type ProcState = {
  readonly id: ProcId;
  name: string;
  readonly cmd: CmdSpec;
  readonly cwd?: string;
  readonly env?: Record<string, string>;
  cols: number;
  rows: number;
  readonly scrollbackLimit?: number;
  status: ProcStatus;
  session?: Session;
  view: ProcView;
};

const argvOf = (cmd: CmdSpec): { file: string; args: readonly string[] } =>
  "shell" in cmd
    ? { file: "bash", args: ["-lc", cmd.shell] }
    : { file: cmd.argv[0], args: cmd.argv.slice(1) };

export type ProcessManagerShape = {
  readonly add: (spec: ProcSpec) => Effect.Effect<ProcId>;
  readonly remove: (id: ProcId) => Effect.Effect<void>;
  readonly rename: (id: ProcId, name: string) => Effect.Effect<void>;

  readonly start: (id: ProcId) => Effect.Effect<void>;
  readonly stop: (id: ProcId) => Effect.Effect<void>;
  readonly kill: (id: ProcId) => Effect.Effect<void>;
  readonly restart: (id: ProcId) => Effect.Effect<void>;
  readonly forceRestart: (id: ProcId) => Effect.Effect<void>;
  readonly pause: (id: ProcId) => Effect.Effect<void>;
  readonly resume: (id: ProcId) => Effect.Effect<void>;
  readonly write: (id: ProcId, data: string) => Effect.Effect<void>;
  readonly resize: (id: ProcId, cols: number, rows: number) => Effect.Effect<void>;

  readonly scrollUp: (id: ProcId, lines: number) => void;
  readonly scrollDown: (id: ProcId, lines: number) => void;
  readonly scrollToTail: (id: ProcId) => void;

  readonly get: (id: ProcId) => ProcState | undefined;
  readonly procs: () => readonly ProcState[];
  readonly current: () => ProcState | undefined;
  readonly currentId: () => ProcId | null;
  readonly selectNext: () => void;
  readonly selectPrev: () => void;
  readonly selectIndex: (i: number) => void;
  readonly selectById: (id: ProcId) => void;

  readonly subscribe: (cb: () => void) => () => void;
  readonly supportsSignals: boolean;
};

export class ProcessManager extends Context.Tag("ProcessManager")<
  ProcessManager,
  ProcessManagerShape
>() {}

export const ProcessManagerLive = Layer.scoped(
  ProcessManager,
  Effect.gen(function* () {
    const pty = yield* Pty;
    const terminalState = yield* TerminalState;
    const outerScope = yield* Effect.scope;

    const procs = new Map<ProcId, ProcState>();
    const order: ProcId[] = [];
    let currentId: ProcId | null = null;
    let nextAutoId = 1;
    const listeners = new Set<() => void>();

    const notify = () => {
      for (const l of listeners) l();
    };

    const waitExit = (state: ProcState): Effect.Effect<void> =>
      state.session
        ? Effect.promise(() => state.session!.handle.exit).pipe(Effect.asVoid)
        : Effect.void;

    const closeSession = (state: ProcState): Effect.Effect<void> =>
      Effect.gen(function* () {
        if (!state.session) return;
        const s = state.session;
        state.session = undefined;
        yield* Scope.close(s.scope, Exit.void);
      });

    const start = (id: ProcId): Effect.Effect<void> =>
      Effect.gen(function* () {
        const state = procs.get(id);
        if (!state) return;
        if (state.status.kind === "running" || state.status.kind === "paused") return;

        yield* closeSession(state);

        const newScope = yield* Scope.fork(outerScope, "sequential" as never);

        const term = yield* terminalState
          .attach(id, {
            cols: state.cols,
            rows: state.rows,
            scrollbackLimit: state.scrollbackLimit,
          })
          .pipe(Scope.extend(newScope));

        const { file, args } = argvOf(state.cmd);
        const handleResult = yield* pty
          .spawn(
            { file, args, cwd: state.cwd, env: state.env },
            { cols: state.cols, rows: state.rows },
          )
          .pipe(Scope.extend(newScope), Effect.either);

        if (Either.isLeft(handleResult)) {
          yield* Scope.close(newScope, Exit.fail(handleResult.left));
          state.status = { kind: "failed", message: handleResult.left.message };
          notify();
          return;
        }

        const handle = handleResult.right;
        const startedAt = Date.now();
        state.session = { scope: newScope, terminal: term, handle };
        state.status = { kind: "running", pid: handle.pid, startedAt };
        notify();

        // Drain bytes → terminal; emit() ends when pty exits, so this fiber
        // completes naturally on child exit.
        yield* Effect.forkIn(
          Stream.runForEach(handle.data, (d) =>
            Effect.sync(() => {
              if (state.session?.handle !== handle) return;
              const before = term.scrollbackCount;
              term.feed(d);
              // When the user has scrolled up, keep their absolute view
              // anchored by advancing the offset by however many lines just
              // entered scrollback. When following tail, offset stays at 0.
              const delta = term.scrollbackCount - before;
              if (delta > 0 && !state.view.followTail)
                state.view.viewOffset = Math.min(
                  state.view.viewOffset + delta,
                  term.scrollbackCount,
                );
              notify();
            }),
          ),
          newScope,
        );

        // Watch for exit and update status.
        yield* Effect.forkIn(
          Effect.promise(() => handle.exit).pipe(
            Effect.tap((exit) =>
              Effect.sync(() => {
                if (state.session?.handle !== handle) return;
                state.status = {
                  kind: "exited",
                  exitCode: exit.exitCode,
                  signal:
                    typeof exit.signal === "string" ? exit.signal : undefined,
                };
                notify();
              }),
            ),
          ),
          newScope,
        );
      });

    const stop = (id: ProcId): Effect.Effect<void> =>
      Effect.gen(function* () {
        const state = procs.get(id);
        if (!state?.session) return;
        yield* state.session.handle.signal("SIGTERM");
      });

    const kill = (id: ProcId): Effect.Effect<void> =>
      Effect.gen(function* () {
        const state = procs.get(id);
        if (!state?.session) return;
        yield* state.session.handle.signal("SIGKILL");
      });

    const restart = (id: ProcId): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* stop(id);
        const state = procs.get(id);
        if (state) yield* waitExit(state);
        yield* start(id);
      });

    const forceRestart = (id: ProcId): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* kill(id);
        const state = procs.get(id);
        if (state) yield* waitExit(state);
        yield* start(id);
      });

    const pause = (id: ProcId): Effect.Effect<void> =>
      Effect.gen(function* () {
        if (!pty.supportsSignals) return;
        const state = procs.get(id);
        if (!state?.session) return;
        if (state.status.kind !== "running") return;
        yield* state.session.handle.signal("SIGSTOP");
        state.status = {
          kind: "paused",
          pid: state.session.handle.pid,
          startedAt: state.status.startedAt,
        };
        notify();
      });

    const resume = (id: ProcId): Effect.Effect<void> =>
      Effect.gen(function* () {
        const state = procs.get(id);
        if (!state?.session) return;
        if (state.status.kind !== "paused") return;
        yield* state.session.handle.signal("SIGCONT");
        state.status = {
          kind: "running",
          pid: state.session.handle.pid,
          startedAt: state.status.startedAt,
        };
        notify();
      });

    const write = (id: ProcId, data: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const state = procs.get(id);
        if (!state?.session) return;
        yield* state.session.handle.write(data);
      });

    const resize = (id: ProcId, cols: number, rows: number): Effect.Effect<void> =>
      Effect.gen(function* () {
        const state = procs.get(id);
        if (!state) return;
        state.cols = cols;
        state.rows = rows;
        if (state.session) {
          yield* state.session.handle.resize(cols, rows);
          state.session.terminal.resize(cols, rows);
        }
        notify();
      });

    const add = (spec: ProcSpec): Effect.Effect<ProcId> =>
      Effect.gen(function* () {
        const id = spec.id ?? `proc-${nextAutoId++}`;
        const name =
          spec.name ??
          ("shell" in spec.cmd ? spec.cmd.shell : spec.cmd.argv.join(" "));
        const state: ProcState = {
          id,
          name,
          cmd: spec.cmd,
          cwd: spec.cwd,
          env: spec.env,
          cols: spec.cols,
          rows: spec.rows,
          scrollbackLimit: spec.scrollbackLimit,
          status: { kind: "idle" },
          view: { viewOffset: 0, followTail: true },
        };
        procs.set(id, state);
        order.push(id);
        if (currentId === null) currentId = id;
        notify();

        if (spec.autostart !== false) yield* start(id);
        return id;
      });

    const remove = (id: ProcId): Effect.Effect<void> =>
      Effect.gen(function* () {
        const state = procs.get(id);
        if (!state) return;
        yield* closeSession(state);
        procs.delete(id);
        const idx = order.indexOf(id);
        if (idx >= 0) order.splice(idx, 1);
        if (currentId === id) currentId = order[idx] ?? order[idx - 1] ?? null;
        notify();
      });

    const rename = (id: ProcId, name: string): Effect.Effect<void> =>
      Effect.sync(() => {
        const state = procs.get(id);
        if (!state) return;
        state.name = name;
        notify();
      });

    const scrollUp = (id: ProcId, lines: number) => {
      const s = procs.get(id);
      if (!s?.session) return;
      const max = s.session.terminal.scrollbackCount;
      s.view.viewOffset = Math.min(s.view.viewOffset + lines, max);
      s.view.followTail = false;
      notify();
    };

    const scrollDown = (id: ProcId, lines: number) => {
      const s = procs.get(id);
      if (!s?.session) return;
      s.view.viewOffset = Math.max(s.view.viewOffset - lines, 0);
      if (s.view.viewOffset === 0) s.view.followTail = true;
      notify();
    };

    const scrollToTail = (id: ProcId) => {
      const s = procs.get(id);
      if (!s) return;
      s.view.viewOffset = 0;
      s.view.followTail = true;
      notify();
    };

    return {
      add,
      remove,
      rename,
      start,
      stop,
      kill,
      restart,
      forceRestart,
      pause,
      resume,
      write,
      resize,
      scrollUp,
      scrollDown,
      scrollToTail,
      get: (id) => procs.get(id),
      procs: () => order.flatMap((id) => (procs.get(id) ? [procs.get(id)!] : [])),
      current: () => (currentId ? procs.get(currentId) : undefined),
      currentId: () => currentId,
      selectNext: () => {
        if (order.length === 0) return;
        const idx = currentId ? order.indexOf(currentId) : -1;
        currentId = order[Math.min(idx + 1, order.length - 1)] ?? currentId;
        notify();
      },
      selectPrev: () => {
        if (order.length === 0) return;
        const idx = currentId ? order.indexOf(currentId) : 1;
        currentId = order[Math.max(idx - 1, 0)] ?? currentId;
        notify();
      },
      selectIndex: (i) => {
        const id = order[i];
        if (id) {
          currentId = id;
          notify();
        }
      },
      selectById: (id) => {
        if (procs.has(id)) {
          currentId = id;
          notify();
        }
      },
      subscribe: (cb) => {
        listeners.add(cb);
        return () => {
          listeners.delete(cb);
        };
      },
      supportsSignals: pty.supportsSignals,
    };
  }),
);
