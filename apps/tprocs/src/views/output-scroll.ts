export type VerticalDirection = "up" | "down";

export type DragScrollIntent = {
  readonly direction: -1 | 1;
  readonly lines: number;
  readonly intervalMs: number;
};

export const WHEEL_LINES_PER_TICK = 3;
export const DRAG_AUTOSCROLL_STALE_MS = 180;

const DRAG_AUTOSCROLL_INTERVAL_MS = 50;
const DRAG_AUTOSCROLL_FAST_DISTANCE = 4;

export const verticalDirection = (direction: string): VerticalDirection | null =>
  direction === "up" || direction === "down" ? direction : null;

export const wheelLines = (delta: number): number =>
  Math.max(1, Math.floor(delta)) * WHEEL_LINES_PER_TICK;

export const dragScrollIntent = (
  row: number,
  visibleRows: number,
): DragScrollIntent | null => {
  if (visibleRows <= 0) return null;

  if (row <= 0) {
    const distance = 1 - row;
    return {
      direction: -1,
      lines: distance >= DRAG_AUTOSCROLL_FAST_DISTANCE ? 2 : 1,
      intervalMs: DRAG_AUTOSCROLL_INTERVAL_MS,
    };
  }

  if (row >= visibleRows - 1) {
    const distance = row - visibleRows + 2;
    return {
      direction: 1,
      lines: distance >= DRAG_AUTOSCROLL_FAST_DISTANCE ? 2 : 1,
      intervalMs: DRAG_AUTOSCROLL_INTERVAL_MS,
    };
  }

  return null;
};
