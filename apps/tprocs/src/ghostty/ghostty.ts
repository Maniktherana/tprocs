/**
 * Bun bindings for libghostty-vt WASM.
 *
 * Vendored & adapted from coder/ghostty-web @ commit 03ead6e1 (MIT). Upstream
 * pristine submodule lives at <repo>/packages/ghostty; the wasm artifact
 * (ghostty-vt.wasm) is checked in here as a build output and gets embedded
 * into the standalone binary by `bun build --compile`.
 *
 * To regenerate the wasm from source:
 *   $ git submodule update --init --recursive
 *   $ (cd packages/ghostty && bash scripts/build-wasm.sh)
 *   $ cp packages/ghostty/ghostty-vt.wasm apps/tprocs/src/ghostty/
 * (Requires Zig 0.15.2+.)
 */

import {
  type GhosttyCell,
  type GhosttyTerminalConfig,
  type GhosttyWasmExports,
  GHOSTTY_CONFIG_SIZE,
  type KeyEvent,
  type RenderStateColors,
  type RenderStateCursor,
  type TerminalHandle,
  DirtyState,
  KeyEncoderOption,
  type KittyKeyFlags,
} from "./types";

// Bun-idiomatic embedded-asset import. At runtime in dev this resolves to a
// filesystem path next to this module; in a `bun build --compile` binary it
// resolves to the in-binary virtual path that Bun.file() understands.
// @ts-expect-error Bun's file-loader import attribute; resolves to a string path at runtime.
import wasmPath from "./ghostty-vt.wasm" with { type: "file" };

export type { GhosttyCell, GhosttyTerminalConfig, RenderStateColors, RenderStateCursor };
export {
  CellFlags,
  DirtyState,
  Key,
  KeyAction,
  KeyEncoderOption,
  Mods,
} from "./types";

export class Ghostty {
  private readonly exports: GhosttyWasmExports;
  readonly memory: WebAssembly.Memory;

  private constructor(instance: WebAssembly.Instance) {
    this.exports = instance.exports as unknown as GhosttyWasmExports;
    this.memory = this.exports.memory;
  }

  static async load(): Promise<Ghostty> {
    const bytes = await Bun.file(wasmPath).arrayBuffer();
    const mod = await WebAssembly.compile(bytes);
    let instance: WebAssembly.Instance;
    instance = await WebAssembly.instantiate(mod, {
      env: {
        log: (ptr: number, len: number) => {
          const exports = instance.exports as unknown as GhosttyWasmExports;
          const u8 = new Uint8Array(exports.memory.buffer, ptr, len);
          console.log("[ghostty-vt]", new TextDecoder().decode(u8));
        },
      },
    });
    return new Ghostty(instance);
  }

  createTerminal(
    cols: number,
    rows: number,
    config?: GhosttyTerminalConfig,
  ): GhosttyTerminal {
    return new GhosttyTerminal(this.exports, this.memory, cols, rows, config);
  }

  createKeyEncoder(): KeyEncoder {
    return new KeyEncoder(this.exports);
  }
}

export class KeyEncoder {
  private readonly exports: GhosttyWasmExports;
  private encoder: number = 0;

  constructor(exports: GhosttyWasmExports) {
    this.exports = exports;
    const ptrPtr = this.exports.ghostty_wasm_alloc_opaque();
    const rc = this.exports.ghostty_key_encoder_new(0, ptrPtr);
    if (rc !== 0) throw new Error(`ghostty key encoder init failed: ${rc}`);
    const view = new DataView(this.exports.memory.buffer);
    this.encoder = view.getUint32(ptrPtr, true);
    this.exports.ghostty_wasm_free_opaque(ptrPtr);
  }

  setOption(option: KeyEncoderOption, value: boolean | number): void {
    const ptr = this.exports.ghostty_wasm_alloc_u8();
    new DataView(this.exports.memory.buffer).setUint8(
      ptr,
      typeof value === "boolean" ? (value ? 1 : 0) : value,
    );
    this.exports.ghostty_key_encoder_setopt(this.encoder, option, ptr);
    this.exports.ghostty_wasm_free_u8(ptr);
  }

  setKittyFlags(flags: KittyKeyFlags): void {
    this.setOption(KeyEncoderOption.KITTY_KEYBOARD_FLAGS, flags);
  }

  encode(event: KeyEvent): Uint8Array {
    const evPtrPtr = this.exports.ghostty_wasm_alloc_opaque();
    const rc = this.exports.ghostty_key_event_new(0, evPtrPtr);
    if (rc !== 0) throw new Error(`ghostty key event init failed: ${rc}`);
    const view = new DataView(this.exports.memory.buffer);
    const evPtr = view.getUint32(evPtrPtr, true);
    this.exports.ghostty_wasm_free_opaque(evPtrPtr);

    this.exports.ghostty_key_event_set_action(evPtr, event.action);
    this.exports.ghostty_key_event_set_key(evPtr, event.key);
    this.exports.ghostty_key_event_set_mods(evPtr, event.mods);

    if (event.utf8) {
      const utf8 = new TextEncoder().encode(event.utf8);
      const utf8Ptr = this.exports.ghostty_wasm_alloc_u8_array(utf8.length);
      new Uint8Array(this.exports.memory.buffer).set(utf8, utf8Ptr);
      this.exports.ghostty_key_event_set_utf8(evPtr, utf8Ptr, utf8.length);
      this.exports.ghostty_wasm_free_u8_array(utf8Ptr, utf8.length);
    }

    const bufSize = 32;
    const bufPtr = this.exports.ghostty_wasm_alloc_u8_array(bufSize);
    const writtenPtr = this.exports.ghostty_wasm_alloc_usize();
    const encRc = this.exports.ghostty_key_encoder_encode(
      this.encoder,
      evPtr,
      bufPtr,
      bufSize,
      writtenPtr,
    );
    if (encRc !== 0) {
      this.exports.ghostty_wasm_free_u8_array(bufPtr, bufSize);
      this.exports.ghostty_wasm_free_usize(writtenPtr);
      this.exports.ghostty_key_event_free(evPtr);
      throw new Error(`ghostty key encode failed: ${encRc}`);
    }
    const written = view.getUint32(writtenPtr, true);
    const out = new Uint8Array(this.exports.memory.buffer, bufPtr, written).slice();
    this.exports.ghostty_wasm_free_u8_array(bufPtr, bufSize);
    this.exports.ghostty_wasm_free_usize(writtenPtr);
    this.exports.ghostty_key_event_free(evPtr);
    return out;
  }

  free(): void {
    if (this.encoder) {
      this.exports.ghostty_key_encoder_free(this.encoder);
      this.encoder = 0;
    }
  }
}

/**
 * One libghostty terminal: VT-100 parser + cell grid + scrollback.
 *
 * Perf notes:
 *  - `update()` syncs render state in ONE wasm call.
 *  - `getViewport()` returns all visible cells in ONE wasm call.
 *  - The cell buffer is pooled and REUSED across calls. Snapshot via `{...cell}`
 *    or `.slice()` if you need to retain cells across writes.
 */
export class GhosttyTerminal {
  private readonly exports: GhosttyWasmExports;
  private readonly memory: WebAssembly.Memory;
  private readonly handle: TerminalHandle;
  private _cols: number;
  private _rows: number;

  private static readonly CELL_SIZE = 16;

  private viewportBufferPtr = 0;
  private viewportBufferSize = 0;

  private cellPool: GhosttyCell[] = [];

  constructor(
    exports: GhosttyWasmExports,
    memory: WebAssembly.Memory,
    cols: number,
    rows: number,
    config?: GhosttyTerminalConfig,
  ) {
    this.exports = exports;
    this.memory = memory;
    this._cols = cols;
    this._rows = rows;

    if (config) {
      const cfgPtr = this.exports.ghostty_wasm_alloc_u8_array(GHOSTTY_CONFIG_SIZE);
      if (cfgPtr === 0) throw new Error("ghostty terminal config OOM");
      try {
        const view = new DataView(this.memory.buffer);
        let off = cfgPtr;
        view.setUint32(off, config.scrollbackLimit ?? 10000, true);
        off += 4;
        view.setUint32(off, config.fgColor ?? 0, true);
        off += 4;
        view.setUint32(off, config.bgColor ?? 0, true);
        off += 4;
        view.setUint32(off, config.cursorColor ?? 0, true);
        off += 4;
        for (let i = 0; i < 16; i++) {
          view.setUint32(off, config.palette?.[i] ?? 0, true);
          off += 4;
        }
        this.handle = this.exports.ghostty_terminal_new_with_config(cols, rows, cfgPtr);
      } finally {
        this.exports.ghostty_wasm_free_u8_array(cfgPtr, GHOSTTY_CONFIG_SIZE);
      }
    } else {
      this.handle = this.exports.ghostty_terminal_new(cols, rows);
    }
    if (!this.handle) throw new Error("ghostty terminal alloc failed");
    this.initCellPool();
  }

  get cols(): number {
    return this._cols;
  }
  get rows(): number {
    return this._rows;
  }

  write(data: string | Uint8Array): void {
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(bytes.length);
    new Uint8Array(this.memory.buffer).set(bytes, ptr);
    this.exports.ghostty_terminal_write(this.handle, ptr, bytes.length);
    this.exports.ghostty_wasm_free_u8_array(ptr, bytes.length);
  }

  resize(cols: number, rows: number): void {
    if (cols === this._cols && rows === this._rows) return;
    this._cols = cols;
    this._rows = rows;
    this.exports.ghostty_terminal_resize(this.handle, cols, rows);
    this.invalidateBuffers();
    this.initCellPool();
  }

  free(): void {
    if (this.viewportBufferPtr) {
      this.exports.ghostty_wasm_free_u8_array(
        this.viewportBufferPtr,
        this.viewportBufferSize,
      );
      this.viewportBufferPtr = 0;
    }
    this.exports.ghostty_terminal_free(this.handle);
  }

  // ----- render state -----

  update(): DirtyState {
    return this.exports.ghostty_render_state_update(this.handle) as DirtyState;
  }

  getCursor(): RenderStateCursor {
    this.update();
    return {
      x: this.exports.ghostty_render_state_get_cursor_x(this.handle),
      y: this.exports.ghostty_render_state_get_cursor_y(this.handle),
      visible: this.exports.ghostty_render_state_get_cursor_visible(this.handle),
    };
  }

  getColors(): RenderStateColors {
    const bg = this.exports.ghostty_render_state_get_bg_color(this.handle);
    const fg = this.exports.ghostty_render_state_get_fg_color(this.handle);
    return {
      background: { r: (bg >> 16) & 0xff, g: (bg >> 8) & 0xff, b: bg & 0xff },
      foreground: { r: (fg >> 16) & 0xff, g: (fg >> 8) & 0xff, b: fg & 0xff },
    };
  }

  isRowDirty(row: number): boolean {
    return this.exports.ghostty_render_state_is_row_dirty(this.handle, row);
  }

  markClean(): void {
    this.exports.ghostty_render_state_mark_clean(this.handle);
  }

  getViewport(): GhosttyCell[] {
    const total = this._cols * this._rows;
    const need = total * GhosttyTerminal.CELL_SIZE;
    if (!this.viewportBufferPtr || this.viewportBufferSize < need) {
      if (this.viewportBufferPtr) {
        this.exports.ghostty_wasm_free_u8_array(
          this.viewportBufferPtr,
          this.viewportBufferSize,
        );
      }
      this.viewportBufferPtr = this.exports.ghostty_wasm_alloc_u8_array(need);
      this.viewportBufferSize = need;
    }
    const count = this.exports.ghostty_render_state_get_viewport(
      this.handle,
      this.viewportBufferPtr,
      total,
    );
    if (count < 0) return this.cellPool;
    this.parseCellsIntoPool(this.viewportBufferPtr, total);
    return this.cellPool;
  }

  // ----- modes -----

  isAlternateScreen(): boolean {
    return !!this.exports.ghostty_terminal_is_alternate_screen(this.handle);
  }

  hasMouseTracking(): boolean {
    return this.exports.ghostty_terminal_has_mouse_tracking(this.handle) !== 0;
  }

  hasBracketedPaste(): boolean {
    return this.getMode(2004, false);
  }

  getMode(mode: number, isAnsi: boolean): boolean {
    return this.exports.ghostty_terminal_get_mode(this.handle, mode, isAnsi) !== 0;
  }

  // ----- scrollback -----

  getScrollbackLength(): number {
    return this.exports.ghostty_terminal_get_scrollback_length(this.handle);
  }

  /**
   * @param offset 0 = oldest, (length-1) = most recent scrollback line
   */
  getScrollbackLine(offset: number): GhosttyCell[] | null {
    const need = this._cols * GhosttyTerminal.CELL_SIZE;
    if (!this.viewportBufferPtr || this.viewportBufferSize < need) {
      if (this.viewportBufferPtr) {
        this.exports.ghostty_wasm_free_u8_array(
          this.viewportBufferPtr,
          this.viewportBufferSize,
        );
      }
      this.viewportBufferPtr = this.exports.ghostty_wasm_alloc_u8_array(need);
      this.viewportBufferSize = need;
    }
    this.update();
    const count = this.exports.ghostty_terminal_get_scrollback_line(
      this.handle,
      offset,
      this.viewportBufferPtr,
      this._cols,
    );
    if (count < 0) return null;
    return this.parseCellsFreshArray(this.viewportBufferPtr, count);
  }

  isRowWrapped(row: number): boolean {
    return this.exports.ghostty_terminal_is_row_wrapped(this.handle, row) !== 0;
  }

  // ----- responses (DSR etc) -----

  hasResponse(): boolean {
    return this.exports.ghostty_terminal_has_response(this.handle);
  }

  readResponse(): string | null {
    if (!this.hasResponse()) return null;
    const bufSize = 256;
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(bufSize);
    try {
      const n = this.exports.ghostty_terminal_read_response(this.handle, ptr, bufSize);
      if (n <= 0) return null;
      return new TextDecoder().decode(
        new Uint8Array(this.memory.buffer, ptr, n).slice(),
      );
    } finally {
      this.exports.ghostty_wasm_free_u8_array(ptr, bufSize);
    }
  }

  // ----- internals -----

  private initCellPool(): void {
    const total = this._cols * this._rows;
    if (this.cellPool.length < total) {
      for (let i = this.cellPool.length; i < total; i++) {
        this.cellPool.push({
          codepoint: 0,
          fg_r: 204,
          fg_g: 204,
          fg_b: 204,
          bg_r: 0,
          bg_g: 0,
          bg_b: 0,
          flags: 0,
          width: 1,
          hyperlink_id: 0,
          grapheme_len: 0,
        });
      }
    }
  }

  private parseCellsIntoPool(ptr: number, count: number): void {
    const buf = this.memory.buffer;
    const u8 = new Uint8Array(buf, ptr, count * GhosttyTerminal.CELL_SIZE);
    const view = new DataView(buf, ptr, count * GhosttyTerminal.CELL_SIZE);
    for (let i = 0; i < count; i++) {
      const off = i * GhosttyTerminal.CELL_SIZE;
      const cell = this.cellPool[i]!;
      cell.codepoint = view.getUint32(off, true);
      cell.fg_r = u8[off + 4]!;
      cell.fg_g = u8[off + 5]!;
      cell.fg_b = u8[off + 6]!;
      cell.bg_r = u8[off + 7]!;
      cell.bg_g = u8[off + 8]!;
      cell.bg_b = u8[off + 9]!;
      cell.flags = u8[off + 10]!;
      cell.width = u8[off + 11]!;
      cell.hyperlink_id = view.getUint16(off + 12, true);
      cell.grapheme_len = u8[off + 14]!;
    }
  }

  private parseCellsFreshArray(ptr: number, count: number): GhosttyCell[] {
    const buf = this.memory.buffer;
    const u8 = new Uint8Array(buf, ptr, count * GhosttyTerminal.CELL_SIZE);
    const view = new DataView(buf, ptr, count * GhosttyTerminal.CELL_SIZE);
    const out: GhosttyCell[] = [];
    for (let i = 0; i < count; i++) {
      const off = i * GhosttyTerminal.CELL_SIZE;
      out.push({
        codepoint: view.getUint32(off, true),
        fg_r: u8[off + 4]!,
        fg_g: u8[off + 5]!,
        fg_b: u8[off + 6]!,
        bg_r: u8[off + 7]!,
        bg_g: u8[off + 8]!,
        bg_b: u8[off + 9]!,
        flags: u8[off + 10]!,
        width: u8[off + 11]!,
        hyperlink_id: view.getUint16(off + 12, true),
        grapheme_len: u8[off + 14]!,
      });
    }
    return out;
  }

  private invalidateBuffers(): void {
    if (this.viewportBufferPtr) {
      this.exports.ghostty_wasm_free_u8_array(
        this.viewportBufferPtr,
        this.viewportBufferSize,
      );
      this.viewportBufferPtr = 0;
      this.viewportBufferSize = 0;
    }
  }
}
