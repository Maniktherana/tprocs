import { Context, Layer } from "effect";
import type { PtyBackend } from "./backend";
import { PtyBackendBun } from "./backend-bun";

export class Pty extends Context.Tag("Pty")<Pty, PtyBackend>() {}

export const PtyLive = Layer.succeed(Pty, PtyBackendBun);

export { PtySpawnError } from "./backend";

export type {
  PtyBackend,
  PtyExit,
  PtyHandle,
  PtySignal,
  PtySize,
  PtySpec,
} from "./backend";
