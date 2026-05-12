import { useKeyboard, useOnResize, useTerminalDimensions } from "@opentui/react";
import { Effect } from "effect";
import { useEffect } from "react";
import { KeymapBar } from "./keymap-bar";
import { Output } from "./output";
import { ProcsList } from "./procs-list";
import { useRenderTick, useServices } from "./services-context";

export function App() {
  useRenderTick();
  const { pane, pm, input } = useServices();
  const dims = useTerminalDimensions();

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
