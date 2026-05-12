import { useKeyboard, useOnResize, useTerminalDimensions } from "@opentui/react";
import { Effect } from "effect";
import { useEffect, useRef } from "react";
import { KeymapBar } from "./keymap-bar";
import { Output } from "./output";
import { ProcsList } from "./procs-list";
import { useRenderTick, useServices } from "./services-context";

const linesForStreak = (streak: number): number =>
  streak <= 3 ? 1 : streak <= 6 ? 2 : streak <= 9 ? 3 : streak <= 13 ? 5 : 8;

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

  // Streak-based scroll accel. Predictable per-tick line counts in tiers
  // (1 → 2 → 3 → 5 → 8) so each tick of the wheel moves a fixed integer
  // number of *lines*, never half-lines or jittery 1/2/4/3/1. The streak
  // resets when direction flips or the user pauses for >150 ms.
  const scrollStateRef = useRef({ dir: 0 as -1 | 0 | 1, streak: 0, lastT: 0 });

  const onOutputScroll = (e: { scroll?: { direction: string; delta: number } }) => {
    if (interactive) return;
    const s = e.scroll;
    if (!s) return;
    const id = pm.currentId();
    if (!id) return;
    const dir = s.direction === "up" ? -1 : s.direction === "down" ? 1 : 0;
    if (dir === 0) return;
    const now = Date.now();
    const ss = scrollStateRef.current;
    ss.streak = ss.dir === dir && now - ss.lastT < 150 ? ss.streak + 1 : 1;
    ss.dir = dir;
    ss.lastT = now;
    const lines = linesForStreak(ss.streak) * Math.max(1, s.delta);
    if (dir === -1) pm.scrollUp(id, lines);
    else pm.scrollDown(id, lines);
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
