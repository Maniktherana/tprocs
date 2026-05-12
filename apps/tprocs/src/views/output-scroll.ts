export type VerticalDirection = "up" | "down";

export type DragScrollIntent = {
  readonly direction: -1 | 1;
  readonly linesPerSecond: number;
  readonly intervalMs: number;
};

export const WHEEL_LINES_PER_TICK = 1;

const DRAG_AUTOSCROLL_INTERVAL_MS = 50;
const DRAG_AUTOSCROLL_EDGE_ROWS = 3;
const DRAG_AUTOSCROLL_SLOW_LINES_PER_SECOND = 6;
const DRAG_AUTOSCROLL_MEDIUM_LINES_PER_SECOND = 18;
const DRAG_AUTOSCROLL_FAST_LINES_PER_SECOND = 36;

export const verticalDirection = (
  direction: string,
): VerticalDirection | null =>
  direction === "up" || direction === "down" ? direction : null;

export const wheelLines = (delta: number): number =>
  Math.max(1, Math.floor(delta)) * WHEEL_LINES_PER_TICK;

const dragScrollSpeed = (distanceFromEdge: number): number =>
  distanceFromEdge <= 0
    ? DRAG_AUTOSCROLL_FAST_LINES_PER_SECOND
    : distanceFromEdge === 1
      ? DRAG_AUTOSCROLL_MEDIUM_LINES_PER_SECOND
      : DRAG_AUTOSCROLL_SLOW_LINES_PER_SECOND;

export const dragScrollIntent = (
  row: number,
  visibleRows: number,
): DragScrollIntent | null => {
  if (visibleRows <= 0) return null;

  if (row < DRAG_AUTOSCROLL_EDGE_ROWS) {
    return {
      direction: -1,
      linesPerSecond: dragScrollSpeed(row),
      intervalMs: DRAG_AUTOSCROLL_INTERVAL_MS,
    };
  }

  if (row >= visibleRows - DRAG_AUTOSCROLL_EDGE_ROWS) {
    return {
      direction: 1,
      linesPerSecond: dragScrollSpeed(visibleRows - 1 - row),
      intervalMs: DRAG_AUTOSCROLL_INTERVAL_MS,
    };
  }

  return null;
};
