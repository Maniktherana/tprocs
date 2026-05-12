/**
 * TypeScript type definitions for libghostty-vt WASM API.
 *
 * Vendored from coder/ghostty-web @ commit 03ead6e1 (MIT). See
 * packages/ghostty/ for the pinned submodule, and ./README.md in this
 * directory for the wasm provenance.
 */

export enum KittyKeyFlags {
  DISABLED = 0,
  DISAMBIGUATE = 1 << 0,
  REPORT_EVENTS = 1 << 1,
  REPORT_ALTERNATES = 1 << 2,
  REPORT_ALL = 1 << 3,
  REPORT_ASSOCIATED = 1 << 4,
  ALL = 0x1f,
}

export enum KeyEncoderOption {
  CURSOR_KEY_APPLICATION = 0,
  KEYPAD_KEY_APPLICATION = 1,
  IGNORE_KEYPAD_WITH_NUMLOCK = 2,
  ALT_ESC_PREFIX = 3,
  MODIFY_OTHER_KEYS_STATE_2 = 4,
  KITTY_KEYBOARD_FLAGS = 5,
}

export enum KeyAction {
  RELEASE = 0,
  PRESS = 1,
  REPEAT = 2,
}

// Physical key codes (matches ghostty/src/input/key.zig)
export enum Key {
  UNIDENTIFIED = 0,
  GRAVE = 1,
  BACKSLASH = 2,
  BRACKET_LEFT = 3,
  BRACKET_RIGHT = 4,
  COMMA = 5,
  ZERO = 6,
  ONE = 7,
  TWO = 8,
  THREE = 9,
  FOUR = 10,
  FIVE = 11,
  SIX = 12,
  SEVEN = 13,
  EIGHT = 14,
  NINE = 15,
  EQUAL = 16,
  A = 20,
  B = 21,
  C = 22,
  D = 23,
  E = 24,
  F = 25,
  G = 26,
  H = 27,
  I = 28,
  J = 29,
  K = 30,
  L = 31,
  M = 32,
  N = 33,
  O = 34,
  P = 35,
  Q = 36,
  R = 37,
  S = 38,
  T = 39,
  U = 40,
  V = 41,
  W = 42,
  X = 43,
  Y = 44,
  Z = 45,
  MINUS = 46,
  PERIOD = 47,
  QUOTE = 48,
  SEMICOLON = 49,
  SLASH = 50,
  ALT_LEFT = 51,
  ALT_RIGHT = 52,
  BACKSPACE = 53,
  CAPS_LOCK = 54,
  CONTEXT_MENU = 55,
  CONTROL_LEFT = 56,
  CONTROL_RIGHT = 57,
  ENTER = 58,
  META_LEFT = 59,
  META_RIGHT = 60,
  SHIFT_LEFT = 61,
  SHIFT_RIGHT = 62,
  SPACE = 63,
  TAB = 64,
  DELETE = 68,
  END = 69,
  HOME = 71,
  INSERT = 72,
  PAGE_DOWN = 73,
  PAGE_UP = 74,
  DOWN = 75,
  LEFT = 76,
  RIGHT = 77,
  UP = 78,
  ESCAPE = 120,
  F1 = 121,
  F2 = 122,
  F3 = 123,
  F4 = 124,
  F5 = 125,
  F6 = 126,
  F7 = 127,
  F8 = 128,
  F9 = 129,
  F10 = 130,
  F11 = 131,
  F12 = 132,
}

export enum Mods {
  NONE = 0,
  SHIFT = 1 << 0,
  CTRL = 1 << 1,
  ALT = 1 << 2,
  SUPER = 1 << 3,
  CAPSLOCK = 1 << 4,
  NUMLOCK = 1 << 5,
}

export interface KeyEvent {
  action: KeyAction;
  key: Key;
  mods: Mods;
  utf8?: string;
}

export interface GhosttyWasmExports {
  memory: WebAssembly.Memory;

  ghostty_wasm_alloc_opaque(): number;
  ghostty_wasm_free_opaque(ptr: number): void;
  ghostty_wasm_alloc_u8_array(len: number): number;
  ghostty_wasm_free_u8_array(ptr: number, len: number): void;
  ghostty_wasm_alloc_u8(): number;
  ghostty_wasm_free_u8(ptr: number): void;
  ghostty_wasm_alloc_usize(): number;
  ghostty_wasm_free_usize(ptr: number): void;

  ghostty_key_encoder_new(allocator: number, encoderPtrPtr: number): number;
  ghostty_key_encoder_free(encoder: number): void;
  ghostty_key_encoder_setopt(encoder: number, option: number, valuePtr: number): number;
  ghostty_key_encoder_encode(
    encoder: number,
    eventPtr: number,
    bufPtr: number,
    bufLen: number,
    writtenPtr: number,
  ): number;

  ghostty_key_event_new(allocator: number, eventPtrPtr: number): number;
  ghostty_key_event_free(event: number): void;
  ghostty_key_event_set_action(event: number, action: number): void;
  ghostty_key_event_set_key(event: number, key: number): void;
  ghostty_key_event_set_mods(event: number, mods: number): void;
  ghostty_key_event_set_utf8(event: number, ptr: number, len: number): void;

  ghostty_terminal_new(cols: number, rows: number): TerminalHandle;
  ghostty_terminal_new_with_config(
    cols: number,
    rows: number,
    configPtr: number,
  ): TerminalHandle;
  ghostty_terminal_free(terminal: TerminalHandle): void;
  ghostty_terminal_resize(terminal: TerminalHandle, cols: number, rows: number): void;
  ghostty_terminal_write(terminal: TerminalHandle, dataPtr: number, dataLen: number): void;

  ghostty_render_state_update(terminal: TerminalHandle): number;
  ghostty_render_state_get_cursor_x(terminal: TerminalHandle): number;
  ghostty_render_state_get_cursor_y(terminal: TerminalHandle): number;
  ghostty_render_state_get_cursor_visible(terminal: TerminalHandle): boolean;
  ghostty_render_state_get_bg_color(terminal: TerminalHandle): number;
  ghostty_render_state_get_fg_color(terminal: TerminalHandle): number;
  ghostty_render_state_is_row_dirty(terminal: TerminalHandle, row: number): boolean;
  ghostty_render_state_mark_clean(terminal: TerminalHandle): void;
  ghostty_render_state_get_viewport(
    terminal: TerminalHandle,
    bufPtr: number,
    bufLen: number,
  ): number;
  ghostty_render_state_get_grapheme(
    terminal: TerminalHandle,
    row: number,
    col: number,
    bufPtr: number,
    bufLen: number,
  ): number;

  ghostty_terminal_is_alternate_screen(terminal: TerminalHandle): boolean;
  ghostty_terminal_has_mouse_tracking(terminal: TerminalHandle): number;
  ghostty_terminal_get_mode(
    terminal: TerminalHandle,
    mode: number,
    isAnsi: boolean,
  ): number;

  ghostty_terminal_get_scrollback_length(terminal: TerminalHandle): number;
  ghostty_terminal_get_scrollback_line(
    terminal: TerminalHandle,
    offset: number,
    bufPtr: number,
    bufLen: number,
  ): number;
  ghostty_terminal_is_row_wrapped(terminal: TerminalHandle, row: number): number;

  ghostty_terminal_has_response(terminal: TerminalHandle): boolean;
  ghostty_terminal_read_response(
    terminal: TerminalHandle,
    bufPtr: number,
    bufLen: number,
  ): number;
}

export enum DirtyState {
  NONE = 0,
  PARTIAL = 1,
  FULL = 2,
}

export interface RenderStateCursor {
  x: number;
  y: number;
  visible: boolean;
}

export interface RenderStateColors {
  background: RGB;
  foreground: RGB;
}

export interface GhosttyTerminalConfig {
  scrollbackLimit?: number;
  fgColor?: number;
  bgColor?: number;
  cursorColor?: number;
  palette?: number[];
}

export const GHOSTTY_CONFIG_SIZE = 80;

export type TerminalHandle = number;

/**
 * Color kind packed into GhosttyCell. fg in bits 0-1, bg in bits 2-3.
 * - RGB     (0): fg_r/g/b (or bg_r/g/b) are literal channels.
 * - PALETTE (1): fg_r (or bg_r) is the palette slot 0-255; other channels = 0.
 * - DEFAULT (2): use terminal default; all channels = 0.
 */
export const enum ColorKind {
  RGB = 0,
  PALETTE = 1,
  DEFAULT = 2,
}

export interface GhosttyCell {
  codepoint: number;
  fg_r: number;
  fg_g: number;
  fg_b: number;
  bg_r: number;
  bg_g: number;
  bg_b: number;
  flags: number;
  width: number;
  hyperlink_id: number;
  grapheme_len: number;
  /** (bg_kind << 2) | fg_kind */
  color_kinds: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export enum CellFlags {
  BOLD = 1 << 0,
  ITALIC = 1 << 1,
  UNDERLINE = 1 << 2,
  STRIKETHROUGH = 1 << 3,
  INVERSE = 1 << 4,
  INVISIBLE = 1 << 5,
  BLINK = 1 << 6,
  FAINT = 1 << 7,
}
