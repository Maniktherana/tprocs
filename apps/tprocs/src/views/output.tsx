import type { BoxRenderable, MouseEvent } from "@opentui/core";
import { Effect } from "effect";
import { useEffect, useRef, useState } from "react";
import {
  extractAbsSelectionText,
  viewportRowToLineId,
  type AbsPoint,
  type AbsSelection,
} from "./lookup";
import { encodeSgrMouse } from "./mouse-encode";
import { ScreenView } from "./screen-view";
import { useRenderTick, useServices } from "./services-context";
import { StreamView } from "./stream-view";

type Point = { row: number; col: number };

const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;

// Auto-scroll feel: distance is "cells past the edge". Tick interval shrinks
// and lines-per-tick grows as the pointer travels further away, so flicking
// the mouse off the box rips through scrollback the way a browser does.
const autoScrollLines = (distance: number): number =>
  Math.max(1, Math.floor(distance / 4));
const autoScrollInterval = (distance: number): number =>
  clamp(120 - distance * 10, 16, 180);

export function Output() {
  useRenderTick();
  const { pm, pane, clipboard } = useServices();
  const proc = pm.current();
  const { cols, rows } = pane.outputSize();
  const isInteractive = pane.focus() === "output-interactive";
  const boxRef = useRef<BoxRenderable | null>(null);
  const [selection, setSelection] = useState<AbsSelection | null>(null);
  const dragRef = useRef<AbsSelection | null>(null);
  const autoScrollRef = useRef<{
    dir: -1 | 0 | 1;
    distance: number;
    timer: ReturnType<typeof setInterval> | null;
  }>({ dir: 0, distance: 0, timer: null });

  useEffect(() => {
    return () => {
      if (autoScrollRef.current.timer) clearInterval(autoScrollRef.current.timer);
    };
  }, []);

  const innerCols = Math.max(0, cols - 2);
  const innerRows = Math.max(0, rows - 2);

  const toLocal = (ev: { x: number; y: number }): Point | null => {
    const box = boxRef.current;
    if (!box) return null;
    return { col: ev.x - box.screenX, row: ev.y - box.screenY };
  };

  const stopAutoScroll = () => {
    const s = autoScrollRef.current;
    if (s.timer) clearInterval(s.timer);
    autoScrollRef.current = { dir: 0, distance: 0, timer: null };
  };

  if (!proc?.session) {
    return (
      <box flexDirection="column" flexGrow={1} padding={1}>
        <text>{proc ? `(${proc.status.kind})` : "no proc selected"}</text>
      </box>
    );
  }

  const term = proc.session.terminal;
  const isAlt = term.usingAltScreen;

  const pointToAbs = (p: Point): AbsPoint => {
    const row = clamp(p.row, 0, Math.max(0, innerRows - 1));
    const col = clamp(p.col, 0, Math.max(0, innerCols - 1));
    return { lineId: viewportRowToLineId(term, proc.view, innerRows, row), col };
  };

  // Repeats scroll while the pointer stays past an edge. After each tick we
  // re-anchor `focus` to the new visible edge so the selection extends by
  // actual log lines, not by viewport rows — the highlight follows whatever
  // content scrolled into view.
  const driveAutoScroll = (dir: -1 | 1, distance: number) => {
    if (isAlt) return;
    const s = autoScrollRef.current;
    if (s.dir === dir && s.distance === distance && s.timer) return;
    if (s.timer) clearInterval(s.timer);
    const lines = autoScrollLines(distance);
    const fire = () => {
      const id = pm.currentId();
      if (!id) return;
      if (dir === -1) pm.scrollUp(id, lines);
      else pm.scrollDown(id, lines);
      const current = dragRef.current;
      if (!current) return;
      const edgeRow = dir === -1 ? 0 : innerRows - 1;
      const edgeCol = dir === -1 ? 0 : Math.max(0, innerCols - 1);
      const focus: AbsPoint = {
        lineId: viewportRowToLineId(term, proc.view, innerRows, edgeRow),
        col: edgeCol,
      };
      const next: AbsSelection = { anchor: current.anchor, focus };
      dragRef.current = next;
      setSelection(next);
    };
    autoScrollRef.current = {
      dir,
      distance,
      timer: setInterval(fire, autoScrollInterval(distance)),
    };
    fire();
  };

  // Returns true iff we actually sent bytes — caller falls back to local
  // behaviour when the child hasn't requested mouse tracking.
  const forwardMouseToPty = (ev: MouseEvent): boolean => {
    if (!term.hasMouseTracking) return false;
    const p = toLocal(ev);
    if (!p) return false;
    if (p.row < 0 || p.row >= innerRows || p.col < 0 || p.col >= innerCols)
      return false;
    const bytes = encodeSgrMouse(ev, p.row, p.col);
    if (!bytes) return false;
    const id = pm.currentId();
    if (!id) return false;
    Effect.runFork(pm.write(id, bytes));
    return true;
  };

  const onMouseDown = (ev: MouseEvent) => {
    if (isInteractive) {
      forwardMouseToPty(ev);
      return;
    }
    const p = toLocal(ev);
    if (!p) return;
    const pt = pointToAbs(p);
    const sel: AbsSelection = { anchor: pt, focus: pt };
    dragRef.current = sel;
    setSelection(sel);
  };

  const onMouseDrag = (ev: MouseEvent) => {
    if (isInteractive) {
      forwardMouseToPty(ev);
      return;
    }
    if (!dragRef.current) return;
    const p = toLocal(ev);
    if (!p) return;

    if (p.row < 0) {
      driveAutoScroll(-1, -p.row);
      return;
    }
    if (p.row >= innerRows) {
      driveAutoScroll(1, p.row - innerRows + 1);
      return;
    }

    stopAutoScroll();
    const focus = pointToAbs(p);
    const next: AbsSelection = { anchor: dragRef.current.anchor, focus };
    dragRef.current = next;
    setSelection(next);
  };

  const onMouseRelease = (ev: MouseEvent) => {
    if (isInteractive) {
      forwardMouseToPty(ev);
      return;
    }
    stopAutoScroll();
    const sel = dragRef.current;
    dragRef.current = null;
    if (!sel) return;
    setSelection(null);
    const text = extractAbsSelectionText(term, sel, innerCols);
    if (text) Effect.runFork(clipboard.copy(text));
  };

  // Wheel routing in interactive mode:
  //   1. Child opted into mouse tracking → send SGR mouse events.
  //   2. Alt-screen (fullscreen TUI) without mouse tracking → synthesize
  //      Up/Down arrow keys; that's what wezterm/Alacritty/iTerm do and what
  //      vim/less/man/htop expect.
  //   3. Plain stream (no alt-screen, no tracking) → scroll our scrollback.
  const onInteractiveScroll = (ev: MouseEvent) => {
    if (!isInteractive) return;
    if (forwardMouseToPty(ev)) return;
    const s = ev.scroll;
    if (!s) return;
    const id = pm.currentId();
    if (!id) return;
    if (isAlt) {
      const key = s.direction === "down" ? "\x1B[B" : s.direction === "up" ? "\x1B[A" : null;
      if (!key) return;
      const ticks = Math.max(1, s.delta);
      Effect.runFork(pm.write(id, key.repeat(ticks)));
      return;
    }
    if (s.direction === "down") pm.scrollDown(id, s.delta);
    else if (s.direction === "up") pm.scrollUp(id, s.delta);
  };

  return (
    <box
      ref={boxRef}
      flexDirection="column"
      flexGrow={1}
      overflow="hidden"
      flexWrap="no-wrap"
      onMouseDown={onMouseDown}
      onMouseDrag={onMouseDrag}
      onMouseDragEnd={onMouseRelease}
      onMouseUp={onMouseRelease}
      onMouseScroll={onInteractiveScroll}
    >
      {isAlt ? (
        <ScreenView
          term={term}
          visibleRows={innerRows}
          visibleCols={innerCols}
          selection={selection}
        />
      ) : (
        <StreamView
          term={term}
          view={proc.view}
          visibleRows={innerRows}
          visibleCols={innerCols}
          selection={selection}
        />
      )}
    </box>
  );
}
