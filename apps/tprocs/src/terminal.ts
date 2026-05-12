import {
  CellFlags,
  Ghostty,
  GhosttyTerminal,
  type GhosttyCell,
} from "./ghostty";

// fg/bg packed as 0xRRGGBB; flags is a CellFlags bitfield; char=0 means "no glyph".
export type Cell = {
  readonly char: number;
  readonly fg: number;
  readonly bg: number;
  readonly flags: number;
};

export type Cursor = { readonly row: number; readonly col: number; readonly visible: boolean };

export type TerminalOptions = {
  cols: number;
  rows: number;
  scrollbackLimit?: number;
};

const BLANK: Cell = { char: 32, fg: 0xff_ff_ff, bg: 0x00_00_00, flags: 0 };

const packRgb = (r: number, g: number, b: number): number =>
  ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);

// Ghostty's wasm bridge resolves `.none` colors against the palette before
// emitting cell bytes, so fg/bg are ALWAYS the real RGB to paint. Do NOT
// substitute defaults here: (0,0,0) is legitimately black, not "default".
const toCell = (raw: GhosttyCell | null | undefined): Cell => {
  if (!raw) return BLANK;
  return {
    char: raw.codepoint || 32,
    fg: packRgb(raw.fg_r, raw.fg_g, raw.fg_b),
    bg: packRgb(raw.bg_r, raw.bg_g, raw.bg_b),
    flags: raw.flags,
  };
};

// Trim only the trailing default-style space cells; cells with non-default bg
// are visually significant (e.g. status bars that pad with spaces).
const trimTrailing = (
  cells: readonly Cell[],
  defaultBg: number,
): readonly Cell[] => {
  let end = cells.length;
  while (end > 0) {
    const c = cells[end - 1]!;
    if (c.char !== 32 || c.flags !== 0 || c.bg !== defaultBg) break;
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
  readonly defaultFg: number;
  readonly defaultBg: number;

  private viewportCache: ViewportCache = null;
  private scrollbackCache = new Map<number, readonly Cell[]>();

  private constructor(
    private readonly core: GhosttyTerminal,
    defaultFg: number,
    defaultBg: number,
  ) {
    this.defaultFg = defaultFg;
    this.defaultBg = defaultBg;
  }

  static create(ghostty: Ghostty, opts: TerminalOptions): Terminal {
    const core = ghostty.createTerminal(opts.cols, opts.rows, {
      scrollbackLimit: opts.scrollbackLimit ?? 0,
    });
    const colors = core.getColors();
    const fg = packRgb(colors.foreground.r, colors.foreground.g, colors.foreground.b);
    const bg = packRgb(colors.background.r, colors.background.g, colors.background.b);
    return new Terminal(core, fg, bg);
  }

  private invalidate(): void {
    this.viewportCache = null;
    this.scrollbackCache.clear();
  }

  feed(data: string | Uint8Array): void {
    this.core.write(data);
    this.invalidate();
  }

  resize(cols: number, rows: number): void {
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
    const trimmed = trimTrailing(raw.map(toCell), this.defaultBg);
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
