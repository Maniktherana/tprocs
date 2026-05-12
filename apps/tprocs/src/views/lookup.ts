import type { ProcView } from "../services/process-manager";
import type { Terminal } from "../terminal";

// Pane-local (row,col): row 0 is the top of the visible window. Depending on
// `view.viewOffset` that may map into scrollback or the live viewport.
export const cellAt = (
  term: Terminal,
  view: ProcView,
  visibleRows: number,
  row: number,
  col: number,
): { char: number } => {
  const sb = term.scrollbackCount;
  const total = sb + term.rows;
  const top = Math.max(0, total - visibleRows - view.viewOffset);
  const logical = top + row;
  if (logical < 0 || logical >= total) return { char: 32 };
  if (logical < sb)
    return { char: term.scrollbackCell(sb - 1 - logical, col).char };
  return { char: term.cell(logical - sb, col).char };
};

export type SelectionRect = {
  readonly startRow: number;
  readonly startCol: number;
  readonly endRow: number;
  readonly endCol: number;
};

export const normaliseRect = (r: SelectionRect): SelectionRect => {
  const [r0, r1] =
    r.startRow <= r.endRow ? [r.startRow, r.endRow] : [r.endRow, r.startRow];
  const flipped = r.startRow > r.endRow;
  const [c0, c1] = flipped
    ? [r.endCol, r.startCol]
    : [r.startCol, r.endCol];
  return { startRow: r0, startCol: c0, endRow: r1, endCol: c1 };
};

// Half-open `[start, end)` column range to highlight on `row` for a
// stream-style selection. Returns null if the row is outside the selection.
export const highlightRangeForRow = (
  rect: SelectionRect,
  row: number,
  visibleCols: number,
): { start: number; end: number } | null => {
  const n = normaliseRect(rect);
  if (row < n.startRow || row > n.endRow) return null;
  if (n.startRow === n.endRow) {
    const a = Math.min(n.startCol, n.endCol);
    const b = Math.max(n.startCol, n.endCol);
    return { start: a, end: b + 1 };
  }
  if (row === n.startRow) return { start: n.startCol, end: visibleCols };
  if (row === n.endRow) return { start: 0, end: n.endCol + 1 };
  return { start: 0, end: visibleCols };
};

const charOf = (n: number): string => String.fromCodePoint(n === 0 ? 32 : n);

// Stream-style: first row from startCol to EOL, middle rows full width, last
// row up to and including endCol. Trailing spaces trimmed per row. NB: coords
// are viewport rows; dragging while scrolling currently follows viewport rows
// rather than logical lines (deferred).
export const extractSelectionText = (
  term: Terminal,
  view: ProcView,
  rect: SelectionRect,
  visibleRows: number,
  visibleCols: number,
): string => {
  const n = normaliseRect(rect);
  if (n.startRow === n.endRow && n.startCol === n.endCol) return "";

  const rows: string[] = [];
  for (let r = n.startRow; r <= n.endRow; r++) {
    const startCol = r === n.startRow ? n.startCol : 0;
    const endCol = r === n.endRow ? n.endCol : visibleCols - 1;
    const chars: string[] = [];
    for (let c = startCol; c <= endCol; c++) {
      chars.push(charOf(cellAt(term, view, visibleRows, r, c).char));
    }
    rows.push(chars.join("").replace(/\s+$/u, ""));
  }
  return rows.join("\n");
};
