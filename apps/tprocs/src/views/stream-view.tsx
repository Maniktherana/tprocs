import type { TextChunk } from "@opentui/core";
import { topLineId, type ProcView } from "../services/proc-view-state";
import type { Cell, Terminal } from "../terminal";
import { highlightRangeForLineId, type AbsSelection } from "./lookup";
import { chunksForLine, styledTextOfLines } from "./styled-line";

type Props = {
  readonly term: Terminal;
  readonly view: ProcView;
  readonly visibleRows: number;
  readonly visibleCols: number;
  readonly selection: AbsSelection | null;
};

const sliceCols = (cells: readonly Cell[], cols: number): readonly Cell[] =>
  cells.length <= cols ? cells : cells.slice(0, cols);

// Single `<text>` payload; per-row `<text>` triggers opentui's word-wrap pass
// and the dreaded multi-column packing bug.
export function StreamView({ term, view, visibleRows, visibleCols, selection }: Props) {
  const sb = term.scrollbackCount;
  const total = sb + term.rows;
  const top = topLineId(view, total, visibleRows);
  const grid = term.viewport();

  const lines: TextChunk[][] = Array.from({ length: visibleRows });
  for (let r = 0; r < visibleRows; r++) {
    const lineId = top + r;
    const hl = selection
      ? highlightRangeForLineId(selection, lineId, visibleCols)
      : null;
    if (lineId < sb) {
      const sbLine = term.scrollbackLine(sb - 1 - lineId);
      lines[r] = chunksForLine(sliceCols(sbLine, visibleCols), hl);
    } else if (lineId < total) {
      const vpRow = grid[lineId - sb] ?? [];
      lines[r] = chunksForLine(sliceCols(vpRow, visibleCols), hl);
    } else if (hl) {
      lines[r] = chunksForLine([], hl);
    } else {
      lines[r] = [];
    }
  }

  return <text wrapMode="none" selectable={false} flexGrow={1} content={styledTextOfLines(lines)} />;
}
