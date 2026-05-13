import type { Effect, Scope, Stream } from "effect";

export type PtyExit = { exitCode: number; signal?: number | string };

export type PtySpec = {
  file: string;
  args: readonly string[];
  cwd?: string;
  env?: Record<string, string>;
  term?: string;
};

export type PtySize = { cols: number; rows: number };

export type PtySignal =
  | "SIGTERM"
  | "SIGKILL"
  | "SIGINT"
  | "SIGSTOP"
  | "SIGCONT"
  | "SIGHUP";

export type PtyHandle = {
  readonly pid: number;
  readonly data: Stream.Stream<string>;
  readonly exit: Promise<PtyExit>;
  readonly write: (data: string) => Effect.Effect<void>;
  readonly resize: (cols: number, rows: number) => Effect.Effect<void>;
  readonly signal: (sig: PtySignal) => Effect.Effect<void>;
};

export class PtySpawnError extends Error {
  readonly _tag = "PtySpawnError";
  override readonly cause: unknown;

  constructor(readonly spec: PtySpec, cause: unknown) {
    super(`Failed to spawn PTY process: ${spec.file}`);
    this.name = "PtySpawnError";
    this.cause = cause;
  }
}

export interface PtyBackend {
  readonly supportsSignals: boolean;
  readonly spawn: (
    spec: PtySpec,
    size: PtySize,
  ) => Effect.Effect<PtyHandle, PtySpawnError, Scope.Scope>;
}
