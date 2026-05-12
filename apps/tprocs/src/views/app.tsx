import {
  useKeyboard,
  useOnResize,
  useTerminalDimensions,
} from "@opentui/react";
import { Effect } from "effect";
import { useEffect, useRef, useState } from "react";
import { ResizeHandle } from "./components/resize-handle";
import { KeymapBar } from "./keymap-bar";
import { Output } from "./output";
import { ProcsList } from "./procs-list";
import { useRenderTick, useServices } from "./services-context";
import { theme } from "./theme";

export function App() {
  useRenderTick();
  const { pane, pm, input } = useServices();
  const dims = useTerminalDimensions();
  // opentui captures drag on whoever's under the cursor at the first drag
  // event, not on the mouse-down target — a 1-col hit area would lose
  // capture instantly. Listen on the parent row container and gate by the
  // original mouse-down x.
  const dragRef = useRef<{ pointerX: number; startWidth: number } | null>(null);
  const [handleActive, setHandleActive] = useState(false);

  useEffect(() => {
    pane.setTerminalSize(dims.width, dims.height);
  }, [dims.width, dims.height]);

  useOnResize((width, height) => {
    pane.setTerminalSize(width, height);
  });

  const out = pane.outputSize();
  const procCols = Math.max(1, out.cols);
  const procRows = Math.max(1, out.rows - 1);
  useEffect(() => {
    for (const p of pm.procs()) {
      if (p.cols !== procCols || p.rows !== procRows) {
        Effect.runFork(pm.resize(p.id, procCols, procRows));
      }
    }
  }, [procCols, procRows]);

  useKeyboard((event) => {
    Effect.runFork(input.handleKey(event));
  });

  const layout = pane.layout();
  const handleCol = layout.procsList.width;

  const endDrag = () => {
    dragRef.current = null;
    setHandleActive(false);
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      <box
        flexDirection="row"
        flexGrow={1}
        onMouseDown={(ev) => {
          if (layout.zoom) return;
          if (ev.x !== handleCol) return;
          dragRef.current = {
            pointerX: ev.x,
            startWidth: pane.procsListWidth(),
          };
          setHandleActive(true);
        }}
        onMouseDrag={(ev) => {
          const start = dragRef.current;
          if (!start) return;
          pane.setProcsListWidth(start.startWidth + (ev.x - start.pointerX));
        }}
        onMouseUp={endDrag}
        onMouseDragEnd={endDrag}
        onMouseDrop={endDrag}
      >
        {!layout.zoom && (
          <>
            <box
              flexDirection="column"
              width={layout.procsList.width}
              backgroundColor={theme.bgPanel}
            >
              <ProcsList />
            </box>
            <ResizeHandle active={handleActive} />
          </>
        )}
        <Output />
      </box>
      {pane.keymapVisible() && (
        <box height={layout.keymap.height} flexDirection="row">
          <KeymapBar />
        </box>
      )}
    </box>
  );
}
