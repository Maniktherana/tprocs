import { RGBA, StyledText, TextAttributes } from "@opentui/core";
import type { TextChunk } from "@opentui/core";
import { CellFlags, ColorKind, type Cell, type CellColor } from "../terminal";

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

const colorKey = (c: CellColor): string => `${c.kind}:${c.value}`;

const styleKey = (cell: Cell): string =>
  `${colorKey(cell.fg)}|${colorKey(cell.bg)}|${cell.flags}`;

const cellChar = (codepoint: number): string =>
  String.fromCodePoint(codepoint === 0 ? 32 : codepoint);

export type HighlightRange = { readonly start: number; readonly end: number };

const DEFAULT_COLOR: CellColor = { kind: ColorKind.DEFAULT, value: 0 };
const BLANK_CELL: Cell = {
  char: 32,
  fg: DEFAULT_COLOR,
  bg: DEFAULT_COLOR,
  flags: 0,
};

// Convert a cell color to opentui's RGBA, preserving the kind so palette /
// default colors travel as indexed / default SGR — the host terminal applies
// its own ANSI palette instead of seeing pre-resolved truecolor.
const toRgbaFg = (c: CellColor): RGBA | null => {
  if (c.kind === ColorKind.DEFAULT) return null;
  if (c.kind === ColorKind.PALETTE) return RGBA.fromIndex(c.value);
  return rgbToRgba(c.value);
};

const toRgbaBg = (c: CellColor): RGBA | null => {
  if (c.kind === ColorKind.DEFAULT) return null;
  if (c.kind === ColorKind.PALETTE) return RGBA.fromIndex(c.value);
  return rgbToRgba(c.value);
};

// Drag-selection highlight uses ANSI palette slots so it adapts to the host
// terminal's theme: ANSI 8 ("bright black") is a mid-gray on dark themes and a
// dim gray on light ones — i.e. always a contrasting band over the underlying
// text without us guessing the bg.
const HIGHLIGHT_BG = RGBA.fromIndex(8);
const HIGHLIGHT_FG = RGBA.fromIndex(15);

/**
 * Collapse a row of cells into a chunk array. Highlighted cells (drag-select)
 * get an explicit palette-indexed bg/fg pair; if the highlight runs past
 * end-of-line the row is padded with blanks so the band stays visible over
 * the empty tail.
 */
export const chunksForLine = (
  cells: readonly Cell[],
  highlight: HighlightRange | null = null,
): TextChunk[] => {
  const padTo = highlight ? Math.max(cells.length, highlight.end) : cells.length;
  const effective: Cell[] =
    padTo > cells.length
      ? [...cells, ...Array.from({ length: padTo - cells.length }, () => BLANK_CELL)]
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
    const highlighted = isHighlighted(runStart);
    const attrs = flagsToAttributes(sample.flags);
    const fg = highlighted ? HIGHLIGHT_FG : toRgbaFg(sample.fg);
    const bg = highlighted ? HIGHLIGHT_BG : toRgbaBg(sample.bg);
    chunks.push({
      __isChunk: true,
      text,
      ...(fg === null ? {} : { fg }),
      ...(bg === null ? {} : { bg }),
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
