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
import {
  DRAG_AUTOSCROLL_STALE_MS,
  WHEEL_FRAME_MS,
  dragScrollIntent,
  queueWheelLines,
  verticalDirection,
  type VerticalDirection,
} from "./output-scroll";
import { ScreenView } from "./screen-view";
import { useRenderTick, useServices } from "./services-context";
import { StreamView } from "./stream-view";

type Point = { row: number; col: number };

const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;

const TOAST_MS = 1200;

export function Output() {
  useRenderTick();
  const { pm, pane, clipboard } = useServices();
  const proc = pm.current();
  const { cols, rows } = pane.outputSize();
  const isInteractive = pane.focus() === "output-interactive";
  const boxRef = useRef<BoxRenderable | null>(null);
  const [selection, setSelection] = useState<AbsSelection | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dragRef = useRef<AbsSelection | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelRef = useRef<{
    direction: VerticalDirection | null;
    pending: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ direction: null, pending: 0, timer: null });
  const autoScrollRef = useRef<{
    dir: -1 | 0 | 1;
    lines: number;
    lastEventAt: number;
    timer: ReturnType<typeof setInterval> | null;
  }>({ dir: 0, lines: 0, lastEventAt: 0, timer: null });

  useEffect(() => {
    return () => {
      if (autoScrollRef.current.timer) clearInterval(autoScrollRef.current.timer);
      if (wheelRef.current.timer) clearTimeout(wheelRef.current.timer);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
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
    autoScrollRef.current = {
      dir: 0,
      lines: 0,
      lastEventAt: 0,
      timer: null,
    };
  };

  const resetWheelScroll = () => {
    const s = wheelRef.current;
    if (s.timer) clearTimeout(s.timer);
    wheelRef.current = { direction: null, pending: 0, timer: null };
  };

  const showToast = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, TOAST_MS);
  };

  useEffect(() => {
    stopAutoScroll();
    resetWheelScroll();
    dragRef.current = null;
    setSelection(null);
  }, [proc?.id, isInteractive]);

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

  const scrollByDirection = (direction: VerticalDirection, lines: number) => {
    const id = pm.currentId();
    if (!id) return;
    if (direction === "up") pm.scrollUp(id, lines);
    else pm.scrollDown(id, lines);
  };

  const flushWheelScroll = () => {
    const { direction, pending } = wheelRef.current;
    wheelRef.current = { direction: null, pending: 0, timer: null };
    if (!direction || pending < 1) return;
    scrollByDirection(direction, pending);
  };

  const queueWheelScroll = (direction: VerticalDirection, delta: number) => {
    const current = wheelRef.current;
    if (current.timer) clearTimeout(current.timer);
    wheelRef.current = {
      direction,
      pending: queueWheelLines(
        current.direction === direction ? current.pending : 0,
        delta,
      ),
      timer: setTimeout(flushWheelScroll, WHEEL_FRAME_MS),
    };
  };

  const updateDragFocusToEdge = (dir: -1 | 1) => {
    const current = dragRef.current;
    if (!current) return;
    const edgeRow = dir === -1 ? 0 : innerRows - 1;
    const edgeCol = dir === -1 ? 0 : Math.max(0, innerCols - 1);
    const next: AbsSelection = {
      anchor: current.anchor,
      focus: {
        lineId: viewportRowToLineId(term, proc.view, innerRows, edgeRow),
        col: edgeCol,
      },
    };
    dragRef.current = next;
    setSelection(next);
  };

  const applyDragScroll = (dir: -1 | 1, lines: number) => {
    const id = pm.currentId();
    if (!id) return;
    if (dir === -1) pm.scrollUp(id, lines);
    else pm.scrollDown(id, lines);
    updateDragFocusToEdge(dir);
  };

  const driveAutoScroll = (intent: NonNullable<ReturnType<typeof dragScrollIntent>>) => {
    if (isAlt) return;
    const s = autoScrollRef.current;
    const now = Date.now();
    autoScrollRef.current.lastEventAt = now;
    if (s.dir === intent.direction && s.lines === intent.lines && s.timer) return;
    if (s.timer) clearInterval(s.timer);
    const fire = () => {
      if (Date.now() - autoScrollRef.current.lastEventAt > DRAG_AUTOSCROLL_STALE_MS) {
        stopAutoScroll();
        return;
      }
      applyDragScroll(intent.direction, intent.lines);
    };
    autoScrollRef.current = {
      dir: intent.direction,
      lines: intent.lines,
      lastEventAt: now,
      timer: setInterval(fire, intent.intervalMs),
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
    resetWheelScroll();
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
    if (!p) {
      stopAutoScroll();
      return;
    }

    const next: AbsSelection = {
      anchor: dragRef.current.anchor,
      focus: pointToAbs(p),
    };
    dragRef.current = next;
    setSelection(next);

    const intent = dragScrollIntent(p.row, innerRows);
    if (intent) {
      driveAutoScroll(intent);
      return;
    }
    stopAutoScroll();
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
    if (text) {
      Effect.runFork(
        clipboard.copy(text).pipe(
          Effect.match({
            onFailure: () => "Copy failed",
            onSuccess: () => "Copied to clipboard",
          }),
          Effect.tap((message) => Effect.sync(() => showToast(message))),
        ),
      );
    }
  };

  const onMouseOut = () => {
    stopAutoScroll();
  };

  // Wheel routing in interactive mode:
  //   1. Child opted into mouse tracking → send SGR mouse events.
  //   2. Alt-screen (fullscreen TUI) without mouse tracking → synthesize
  //      Up/Down arrow keys; that's what wezterm/Alacritty/iTerm do and what
  //      vim/less/man/htop expect.
  //   3. Plain stream (no alt-screen, no tracking) → scroll our scrollback.
  const onMouseScroll = (ev: MouseEvent) => {
    stopAutoScroll();
    if (isInteractive && forwardMouseToPty(ev)) return;
    const s = ev.scroll;
    if (!s) return;
    const id = pm.currentId();
    if (!id) return;
    const direction = verticalDirection(s.direction);
    if (!direction) return;

    if (isInteractive && isAlt) {
      const key = s.direction === "down" ? "\x1B[B" : s.direction === "up" ? "\x1B[A" : null;
      if (!key) return;
      const ticks = Math.max(1, s.delta);
      Effect.runFork(pm.write(id, key.repeat(ticks)));
      return;
    }
    queueWheelScroll(direction, s.delta);
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
      onMouseDrop={onMouseRelease}
      onMouseOut={onMouseOut}
      onMouseUp={onMouseRelease}
      onMouseScroll={onMouseScroll}
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
      {toast && (
        <box
          position="absolute"
          bottom={0}
          right={1}
          paddingX={1}
          backgroundColor="#1f2937"
        >
          <text fg="#d1fae5">{toast}</text>
        </box>
      )}
    </box>
  );
}
