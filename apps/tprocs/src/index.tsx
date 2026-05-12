import { createRoot } from "@opentui/react";
import { Effect, Layer, ManagedRuntime } from "effect";
import { parseCli, USAGE } from "./cli";
import { Clipboard, ClipboardLive } from "./services/clipboard";
import { InputRouter, InputRouterLive } from "./services/input-router";
import { PaneService, PaneServiceLive } from "./services/pane";
import { ProcessManager, ProcessManagerLive } from "./services/process-manager";
import { PtyLive } from "./services/pty/service";
import { Renderer, RendererLive } from "./services/renderer";
import { RendererBridge, RendererBridgeLive } from "./services/renderer-bridge";
import { TerminalEngineLive } from "./services/terminal-engine";
import { TerminalStateLive } from "./services/terminal-state";
import { App } from "./views/app";
import { ServicesProvider, type Services } from "./views/services-context";

const parsed = parseCli(process.argv.slice(2));
if (parsed.kind === "help") {
  console.log(USAGE);
  process.exit(0);
}
if (parsed.kind === "error") {
  console.error(`tprocs: ${parsed.message}\n${USAGE}`);
  process.exit(2);
}

const Engine = TerminalEngineLive;
const TerminalStateProvided = TerminalStateLive.pipe(Layer.provide(Engine));
const BaseDeps = Layer.mergeAll(PtyLive, TerminalStateProvided);
const Mid = Layer.mergeAll(ProcessManagerLive, PaneServiceLive).pipe(
  Layer.provide(BaseDeps),
);
const AppLayer = Layer.mergeAll(
  RendererLive,
  RendererBridgeLive,
  InputRouterLive,
  ClipboardLive,
).pipe(Layer.provideMerge(Mid));

const runtime = ManagedRuntime.make(AppLayer);

const services: Services = await runtime.runPromise(
  Effect.all({
    pm: ProcessManager,
    pane: PaneService,
    bridge: RendererBridge,
    input: InputRouter,
    clipboard: Clipboard,
  }),
);
const { renderer } = await runtime.runPromise(Renderer);

for (const p of parsed.procs) {
  await runtime.runPromise(
    services.pm.add({
      name: p.name,
      cmd: { shell: p.shell },
      cols: 80,
      rows: 24,
      scrollbackLimit: parsed.scrollbackLimit,
    }),
  );
}

let disposing = false;
const dispose = (exitCode: number): void => {
  if (disposing) return;
  disposing = true;
  runtime
    .dispose()
    .catch((err) => console.error("dispose failed:", err))
    .finally(() => process.exit(exitCode));
};

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => dispose(0));
}
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
  dispose(1);
});
process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err);
  dispose(1);
});

createRoot(renderer).render(
  <ServicesProvider value={services}>
    <App />
  </ServicesProvider>,
);
