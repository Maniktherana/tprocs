import { topLineId, type ProcView } from "../services/proc-view-state";
import type { Cell, Terminal } from "../terminal";

// A `lineId` is "absolute row from the top of all currently-held content"
// (scrollback first, then viewport). It is stable across (a) live output that
// pushes the viewport into scrollback and (b) the user's view scrolling — the
// content under a given lineId stays the same until the ring buffer drops it.
//
//   lineId in [0, scrollbackCount)            → scrollback line
//   lineId in [scrollbackCount, sb + rows)    → viewport row (lineId - sb)

export type AbsPoint = { readonly lineId: number; readonly col: number };
export type AbsSelection = { readonly anchor: AbsPoint; readonly focus: AbsPoint };

export const viewportRowToLineId = (
  term: Terminal,
  view: ProcView,
  visibleRows: number,
  row: number,
): number => {
  const sb = term.scrollbackCount;
  return topLineId(view, sb + term.rows, visibleRows) + row;
};

const lineCellsByLineId = (term: Terminal, lineId: number): readonly Cell[] => {
  const sb = term.scrollbackCount;
  if (lineId < 0) return [];
  if (lineId < sb) return term.scrollbackLine(sb - 1 - lineId);
  const vpRow = lineId - sb;
  if (vpRow < 0 || vpRow >= term.rows) return [];
  return term.viewport()[vpRow] ?? [];
};

// Order anchor/focus into document order (start <= end). Inclusive bounds.
const order = (sel: AbsSelection): { start: AbsPoint; end: AbsPoint } => {
  const a = sel.anchor;
  const f = sel.focus;
  if (a.lineId !== f.lineId) {
    return a.lineId < f.lineId ? { start: a, end: f } : { start: f, end: a };
  }
  return a.col <= f.col ? { start: a, end: f } : { start: f, end: a };
};

// Half-open `[start, end)` column range to inverse-highlight on `lineId`.
// Returns null if the line is outside the selection.
export const highlightRangeForLineId = (
  sel: AbsSelection,
  lineId: number,
  visibleCols: number,
): { start: number; end: number } | null => {
  const { start, end } = order(sel);
  if (lineId < start.lineId || lineId > end.lineId) return null;
  if (start.lineId === end.lineId)
    return { start: start.col, end: end.col + 1 };
  if (lineId === start.lineId) return { start: start.col, end: visibleCols };
  if (lineId === end.lineId) return { start: 0, end: end.col + 1 };
  return { start: 0, end: visibleCols };
};

const charOf = (n: number): string => String.fromCodePoint(n === 0 ? 32 : n);

// Walk lineIds in order. Each line's slice is independent of viewport state at
// release time — we look up actual content by lineId, so scrolling mid-drag
// never affects what gets copied.
export const extractAbsSelectionText = (
  term: Terminal,
  sel: AbsSelection,
  visibleCols: number,
): string => {
  const { start, end } = order(sel);
  if (start.lineId === end.lineId && start.col === end.col) return "";

  const rows: string[] = [];
  for (let id = start.lineId; id <= end.lineId; id++) {
    const cells = lineCellsByLineId(term, id);
    const startCol = id === start.lineId ? start.col : 0;
    const endCol = id === end.lineId ? end.col : Math.max(visibleCols, cells.length) - 1;
    const text: string[] = [];
    for (let c = startCol; c <= endCol; c++) {
      text.push(charOf(cells[c]?.char ?? 32));
    }
    rows.push(text.join("").replace(/\s+$/u, ""));
  }
  return rows.join("\n");
};
