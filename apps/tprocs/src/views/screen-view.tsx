import type { TextChunk } from "@opentui/core";
import type { Terminal } from "../terminal";
import { highlightRangeForLineId, type AbsSelection } from "./lookup";
import { chunksForLine, styledTextOfLines } from "./styled-line";

type Props = {
  readonly term: Terminal;
  readonly visibleRows: number;
  readonly visibleCols: number;
  readonly selection: AbsSelection | null;
};

// Alt-screen has no scrollback, so lineId == viewport row offset by sb.
export function ScreenView({ term, visibleRows, visibleCols, selection }: Props) {
  const rows = Math.min(visibleRows, term.rows);
  const cols = Math.min(visibleCols, term.cols);
  const sb = term.scrollbackCount;

  const grid = term.viewport();
  const lines: TextChunk[][] = Array.from({ length: rows });
  for (let r = 0; r < rows; r++) {
    const row = grid[r] ?? [];
    const hl = selection
      ? highlightRangeForLineId(selection, sb + r, cols)
      : null;
    lines[r] = chunksForLine(row.slice(0, cols), hl);
  }

  return <text wrapMode="none" selectable={false} flexGrow={1} content={styledTextOfLines(lines)} />;
}
