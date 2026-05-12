import type { TextChunk } from "@opentui/core";
import type { ProcView } from "../services/process-manager";
import type { Cell, Terminal } from "../terminal";
import { highlightRangeForRow, type SelectionRect } from "./lookup";
import { chunksForLine, styledTextOfLines } from "./styled-line";

type Props = {
  readonly term: Terminal;
  readonly view: ProcView;
  readonly visibleRows: number;
  readonly visibleCols: number;
  readonly selection: SelectionRect | null;
};

const sliceCols = (cells: readonly Cell[], cols: number): readonly Cell[] =>
  cells.length <= cols ? cells : cells.slice(0, cols);

// All rows are rendered through a single `<text>` with a StyledText payload.
// Per-row `<text>` is non-negotiably out: opentui then word-wraps and packs
// overflow into extra columns.
export function StreamView({ term, view, visibleRows, visibleCols, selection }: Props) {
  const sb = term.scrollbackCount;
  const total = sb + term.rows;
  const top = Math.max(0, total - visibleRows - view.viewOffset);
  const fg = term.defaultFg;
  const bg = term.defaultBg;
  const grid = term.viewport();

  const lines: TextChunk[][] = Array.from({ length: visibleRows });
  for (let r = 0; r < visibleRows; r++) {
    const hl = selection
      ? highlightRangeForRow(selection, r, visibleCols)
      : null;
    const logical = top + r;
    if (logical < sb) {
      const sbLine = term.scrollbackLine(sb - 1 - logical);
      lines[r] = chunksForLine(sliceCols(sbLine, visibleCols), fg, bg, hl);
    } else if (logical < total) {
      const vpRow = grid[logical - sb] ?? [];
      lines[r] = chunksForLine(sliceCols(vpRow, visibleCols), fg, bg, hl);
    } else if (hl) {
      lines[r] = chunksForLine([], fg, bg, hl);
    } else {
      lines[r] = [];
    }
  }

  return <text wrapMode="none" selectable={false} flexGrow={1} content={styledTextOfLines(lines)} />;
}
