import {
  CellFlags,
  Ghostty,
  GhosttyTerminal,
  type GhosttyCell,
} from "./ghostty";

// Color kind preserved from Ghostty's parser so we can decide whether to emit
// truecolor, indexed (palette-passthrough), or "use terminal default" SGR.
// Mirrors GhosttyCell.color_kinds nibbles in packages/ghostty.
export const enum ColorKind {
  RGB = 0,
  PALETTE = 1,
  DEFAULT = 2,
}

// `value` meaning depends on `kind`:
//   - RGB:     0xRRGGBB
//   - PALETTE: palette slot 0-255
//   - DEFAULT: 0 (use terminal default)
export type CellColor = { readonly kind: ColorKind; readonly value: number };

export type Cell = {
  readonly char: number;
  readonly fg: CellColor;
  readonly bg: CellColor;
  readonly flags: number;
};

export type Cursor = { readonly row: number; readonly col: number; readonly visible: boolean };

export type TerminalOptions = {
  cols: number;
  rows: number;
  scrollbackLimit?: number;
};

const DEFAULT_COLOR: CellColor = { kind: ColorKind.DEFAULT, value: 0 };
const BLANK: Cell = { char: 32, fg: DEFAULT_COLOR, bg: DEFAULT_COLOR, flags: 0 };

const packRgb = (r: number, g: number, b: number): number =>
  ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);

const decodeColor = (kind: number, r: number, g: number, b: number): CellColor => {
  if (kind === ColorKind.PALETTE) return { kind: ColorKind.PALETTE, value: r };
  if (kind === ColorKind.DEFAULT) return DEFAULT_COLOR;
  return { kind: ColorKind.RGB, value: packRgb(r, g, b) };
};

const toCell = (raw: GhosttyCell | null | undefined): Cell => {
  if (!raw) return BLANK;
  const fgKind = raw.color_kinds & 0x03;
  const bgKind = (raw.color_kinds >> 2) & 0x03;
  return {
    char: raw.codepoint || 32,
    fg: decodeColor(fgKind, raw.fg_r, raw.fg_g, raw.fg_b),
    bg: decodeColor(bgKind, raw.bg_r, raw.bg_g, raw.bg_b),
    flags: raw.flags,
  };
};

// Trim trailing blank cells (space char, no flags, default bg). Cells whose bg
// is anything other than DEFAULT are visually significant (e.g. status bars
// that pad with spaces) and must stay.
const trimTrailing = (cells: readonly Cell[]): readonly Cell[] => {
  let end = cells.length;
  while (end > 0) {
    const c = cells[end - 1]!;
    if (c.char !== 32 || c.flags !== 0 || c.bg.kind !== ColorKind.DEFAULT) break;
    end--;
  }
  return cells.slice(0, end);
};

// Per-frame cache. mprocs reads cells directly from in-process Rust structs;
// we'd be paying a wasm boundary crossing per cell. Solution: bulk-read the
// viewport (and each scrollback line on demand) once per frame, invalidated
// on feed/resize.
type ViewportCache = readonly (readonly Cell[])[] | null;

export class Terminal {
  private viewportCache: ViewportCache = null;
  private scrollbackCache = new Map<number, readonly Cell[]>();
  private disposed = false;

  private constructor(private readonly core: GhosttyTerminal) {}

  static create(ghostty: Ghostty, opts: TerminalOptions): Terminal {
    const core = ghostty.createTerminal(opts.cols, opts.rows, {
      scrollbackLimit: opts.scrollbackLimit ?? 0,
    });
    return new Terminal(core);
  }

  private invalidate(): void {
    this.viewportCache = null;
    this.scrollbackCache.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.invalidate();
    this.core.free();
  }

  feed(data: string | Uint8Array): void {
    if (this.disposed) return;
    this.core.write(data);
    this.invalidate();
  }

  resize(cols: number, rows: number): void {
    if (this.disposed) return;
    this.core.resize(cols, rows);
    this.invalidate();
  }

  get cols(): number { return this.core.cols; }
  get rows(): number { return this.core.rows; }
  get usingAltScreen(): boolean { return this.core.isAlternateScreen(); }
  get scrollbackCount(): number { return this.core.getScrollbackLength(); }
  get hasMouseTracking(): boolean { return this.core.hasMouseTracking(); }

  cursor(): Cursor {
    const c = this.core.getCursor();
    return { row: c.y, col: c.x, visible: c.visible };
  }

  viewport(): readonly (readonly Cell[])[] {
    if (this.viewportCache) return this.viewportCache;
    this.core.update();
    const flat = this.core.getViewport();
    const cols = this.core.cols;
    const rows = this.core.rows;
    const grid: (readonly Cell[])[] = Array.from({ length: rows });
    for (let r = 0; r < rows; r++) {
      const row: Cell[] = Array.from({ length: cols });
      const base = r * cols;
      for (let c = 0; c < cols; c++) row[c] = toCell(flat[base + c]);
      grid[r] = row;
    }
    this.viewportCache = grid;
    return grid;
  }

  // `offset = 0` is the newest scrollback line; internally we flip to ghostty's
  // "0 = oldest" indexing.
  scrollbackLine(offset: number): readonly Cell[] {
    const cached = this.scrollbackCache.get(offset);
    if (cached) return cached;
    const len = this.core.getScrollbackLength();
    if (offset < 0 || offset >= len) return [];
    const raw = this.core.getScrollbackLine(len - 1 - offset);
    if (!raw) return [];
    const trimmed = trimTrailing(raw.map(toCell));
    this.scrollbackCache.set(offset, trimmed);
    return trimmed;
  }

  cell(row: number, col: number): Cell {
    if (row < 0 || row >= this.core.rows) return BLANK;
    if (col < 0 || col >= this.core.cols) return BLANK;
    return this.viewport()[row]?.[col] ?? BLANK;
  }

  scrollbackCell(offset: number, col: number): Cell {
    return this.scrollbackLine(offset)[col] ?? BLANK;
  }

  scrollbackLineLen(offset: number): number {
    return this.scrollbackLine(offset).length;
  }

  isDirtyRow(row: number): boolean { return this.core.isRowDirty(row); }
  clearDirty(): void { this.core.markClean(); }
}

export { CellFlags };
