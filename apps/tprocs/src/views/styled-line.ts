import { RGBA, StyledText, TextAttributes } from "@opentui/core";
import type { TextChunk } from "@opentui/core";
import { CellFlags, type Cell } from "../terminal";

const flagsToAttributes = (flags: number): number => {
  let attr = 0;
  if (flags & CellFlags.BOLD) attr |= TextAttributes.BOLD;
  if (flags & CellFlags.FAINT) attr |= TextAttributes.DIM;
  if (flags & CellFlags.ITALIC) attr |= TextAttributes.ITALIC;
  if (flags & CellFlags.UNDERLINE) attr |= TextAttributes.UNDERLINE;
  if (flags & CellFlags.BLINK) attr |= TextAttributes.BLINK;
  if (flags & CellFlags.INVERSE) attr |= TextAttributes.INVERSE;
  if (flags & CellFlags.INVISIBLE) attr |= TextAttributes.HIDDEN;
  if (flags & CellFlags.STRIKETHROUGH) attr |= TextAttributes.STRIKETHROUGH;
  return attr;
};

const rgbToRgba = (packed: number): RGBA =>
  RGBA.fromInts((packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff);

// String-encoded so the full 24+24+8 bits fit without Number-safe-integer overflow.
const styleKey = (cell: Cell): string =>
  `${cell.fg}|${cell.bg}|${cell.flags}`;

const cellChar = (codepoint: number): string =>
  String.fromCodePoint(codepoint === 0 ? 32 : codepoint);

export type HighlightRange = { readonly start: number; readonly end: number };

const blankCell = (defaultFg: number, defaultBg: number): Cell => ({
  char: 32,
  fg: defaultFg,
  bg: defaultBg,
  flags: 0,
});

/**
 * Collapse a row of cells into a chunk array. Highlighted cells (drag-select)
 * get `INVERSE` OR'd onto their attributes; if the highlight runs past
 * end-of-line the row is padded with default blanks so the inverse band stays
 * visible over the empty tail.
 */
export const chunksForLine = (
  cells: readonly Cell[],
  defaultFg: number,
  defaultBg: number,
  highlight: HighlightRange | null = null,
): TextChunk[] => {
  const padTo = highlight ? Math.max(cells.length, highlight.end) : cells.length;
  const effective: Cell[] =
    padTo > cells.length
      ? [...cells, ...Array.from({ length: padTo - cells.length }, () => blankCell(defaultFg, defaultBg))]
      : (cells as Cell[]);

  const chunks: TextChunk[] = [];
  if (effective.length === 0) return chunks;

  const isHighlighted = (col: number): boolean =>
    highlight !== null && col >= highlight.start && col < highlight.end;

  const keyAt = (col: number): string =>
    `${styleKey(effective[col]!)}|${isHighlighted(col) ? "H" : "_"}`;

  let runStart = 0;
  let runKey = keyAt(0);

  for (let i = 1; i <= effective.length; i++) {
    const here = i < effective.length ? keyAt(i) : "$end";
    if (here === runKey) continue;
    const sample = effective[runStart]!;
    let text = "";
    for (let j = runStart; j < i; j++) text += cellChar(effective[j]!.char);
    const inverse = isHighlighted(runStart) ? TextAttributes.INVERSE : 0;
    const attrs = flagsToAttributes(sample.flags) | inverse;
    chunks.push({
      __isChunk: true,
      text,
      ...(sample.fg === defaultFg ? {} : { fg: rgbToRgba(sample.fg) }),
      ...(sample.bg === defaultBg ? {} : { bg: rgbToRgba(sample.bg) }),
      ...(attrs === 0 ? {} : { attributes: attrs }),
    });
    runStart = i;
    runKey = here;
  }
  return chunks;
};

const newlineChunk = (): TextChunk => ({ __isChunk: true, text: "\n" });
const emptyChunk = (): TextChunk => ({ __isChunk: true, text: "" });

export const styledTextOfLines = (lines: readonly TextChunk[][]): StyledText => {
  const chunks: TextChunk[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.length === 0) chunks.push(emptyChunk());
    else for (const c of line) chunks.push(c);
    if (i < lines.length - 1) chunks.push(newlineChunk());
  }
  return new StyledText(chunks);
};
