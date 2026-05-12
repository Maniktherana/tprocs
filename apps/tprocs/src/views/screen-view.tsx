import type { TextChunk } from "@opentui/core";
import type { Terminal } from "../terminal";
import { highlightRangeForRow, type SelectionRect } from "./lookup";
import { chunksForLine, styledTextOfLines } from "./styled-line";

type Props = {
  readonly term: Terminal;
  readonly visibleRows: number;
  readonly visibleCols: number;
  readonly selection: SelectionRect | null;
};

export function ScreenView({ term, visibleRows, visibleCols, selection }: Props) {
  const rows = Math.min(visibleRows, term.rows);
  const cols = Math.min(visibleCols, term.cols);
  const fg = term.defaultFg;
  const bg = term.defaultBg;

  const grid = term.viewport();
  const lines: TextChunk[][] = Array.from({ length: rows });
  for (let r = 0; r < rows; r++) {
    const row = grid[r] ?? [];
    const hl = selection ? highlightRangeForRow(selection, r, cols) : null;
    lines[r] = chunksForLine(row.slice(0, cols), fg, bg, hl);
  }

  return <text wrapMode="none" selectable={false} flexGrow={1} content={styledTextOfLines(lines)} />;
}
