import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { Effect, Layer, ManagedRuntime } from "effect";
import { parseCli, USAGE } from "./cli";
import { Clipboard, ClipboardLive } from "./services/clipboard";
import { InputRouter, InputRouterLive } from "./services/input-router";
import { PaneService, PaneServiceLive } from "./services/pane";
import { ProcessManager, ProcessManagerLive } from "./services/process-manager";
import { PtyLive } from "./services/pty/service";
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

// Layer graph (bottom-up):
//   TerminalEngineLive  — loads the ghostty wasm exactly once
//   TerminalStateLive   — depends on TerminalEngine; spawns per-proc terminals
//   PtyLive             — independent
//   ProcessManagerLive  — depends on both
//   PaneServiceLive     — independent UI state
//   RendererBridgeLive  — depends on PM + Pane to subscribe to mutations
//   InputRouter / Clipboard — top of stack
const Engine = TerminalEngineLive;
const TerminalStateProvided = TerminalStateLive.pipe(Layer.provide(Engine));
const BaseDeps = Layer.mergeAll(PtyLive, TerminalStateProvided);
const Mid = Layer.mergeAll(ProcessManagerLive, PaneServiceLive).pipe(
  Layer.provide(BaseDeps),
);
const AppLayer = Layer.mergeAll(
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

for (const p of parsed.procs) {
  await runtime.runPromise(
    services.pm.add({
      name: p.name,
      cmd: { shell: p.shell },
      cols: 80,
      rows: 24,
    }),
  );
}

const renderer = await createCliRenderer();
createRoot(renderer).render(
  <ServicesProvider value={services}>
    <App />
  </ServicesProvider>,
);
