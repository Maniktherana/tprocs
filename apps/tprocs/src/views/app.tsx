import { MacOSScrollAccel } from "@opentui/core";
import { useKeyboard, useOnResize, useTerminalDimensions } from "@opentui/react";
import { Effect } from "effect";
import { useEffect, useRef } from "react";
import { KeymapBar } from "./keymap-bar";
import { Output } from "./output";
import { ProcsList } from "./procs-list";
import { useRenderTick, useServices } from "./services-context";

export function App() {
  useRenderTick();
  const { pane, pm, input } = useServices();
  const dims = useTerminalDimensions();

  // Border eats 2 cells per axis, so the inner content area is `outputSize() - 2`.
  const syncPaneSize = (w: number, h: number) => {
    pane.setTerminalSize(w, h);
    const out = pane.outputSize();
    const cols = Math.max(1, out.cols - 2);
    const rows = Math.max(1, out.rows - 2);
    for (const p of pm.procs()) {
      if (p.cols !== cols || p.rows !== rows) {
        Effect.runFork(pm.resize(p.id, cols, rows));
      }
    }
  };

  useEffect(() => {
    syncPaneSize(dims.width, dims.height);
  }, [dims.width, dims.height]);

  useOnResize((width, height) => {
    syncPaneSize(width, height);
  });

  useKeyboard((event) => {
    Effect.runFork(input.handleKey(event));
  });

  const layout = pane.layout();
  const interactive = pane.focus() === "output-interactive";
  const proc = pm.current();
  const procTitle = proc ? `${proc.name}` : "Terminal";
  const terminalTitle = interactive
    ? `${procTitle} · INTERACT`
    : `${procTitle} · view`;

  // Opentui's mouse parser emits delta=1 per tick. macOS-style accel turns
  // fast flicks into page-scrolls while keeping slow ticks line-by-line.
  const scrollAccelRef = useRef(new MacOSScrollAccel());
  const onOutputScroll = (e: { scroll?: { direction: string; delta: number } }) => {
    if (interactive) return;
    const s = e.scroll;
    if (!s) return;
    const id = pm.currentId();
    if (!id) return;
    const multiplier = scrollAccelRef.current.tick();
    const lines = Math.max(1, Math.round(s.delta * multiplier));
    if (s.direction === "down") pm.scrollDown(id, lines);
    else if (s.direction === "up") pm.scrollUp(id, lines);
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      <box flexDirection="row" flexGrow={1}>
        {!layout.zoom && (
          <box
            flexDirection="column"
            width={layout.procsList.width}
            border
            title="Processes"
          >
            <ProcsList />
          </box>
        )}
        <box
          flexDirection="column"
          flexGrow={1}
          border
          borderColor={interactive ? "#fbbf24" : undefined}
          title={terminalTitle}
          onMouseScroll={onOutputScroll}
        >
          <Output />
        </box>
      </box>
      {pane.keymapVisible() && (
        <box height={3} border title="Help">
          <KeymapBar />
        </box>
      )}
    </box>
  );
}
