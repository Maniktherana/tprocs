import { Context, Effect, Layer } from "effect";

export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/**
 * Where keyboard input is routed. mprocs-style two-mode model.
 *
 * - `procs`              — default. ALL app shortcuts work here. The output
 *                          pane is view-only; wheel scrolls scrollback,
 *                          drag selects text. Keyboard never reaches the
 *                          child process.
 * - `output-interactive` — keys/mouse forwarded to the child PTY (vim,
 *                          btop, fzf, …). Entered with `i`/`Enter` or
 *                          double-click. Exited with `Esc` / `Ctrl-A`, or
 *                          by clicking another pane.
 * - `menu`               — commands menu focused.
 */
export type FocusScope = "procs" | "output-interactive" | "menu";

export type Layout = {
  readonly procsList: Rect;
  readonly output: Rect;
  readonly keymap: Rect;
  readonly zoom: boolean;
};

const PROCS_LIST_WIDTH = 30;
const KEYMAP_BAR_HEIGHT = 3;

export type PaneShape = {
  readonly setTerminalSize: (cols: number, rows: number) => void;
  readonly setFocus: (scope: FocusScope) => void;
  readonly toggleFocus: () => void;
  readonly setZoom: (zoomed: boolean) => void;
  readonly toggleZoom: () => void;
  readonly toggleKeymap: () => void;
  readonly outputSize: () => { cols: number; rows: number };
  readonly layout: () => Layout;
  readonly focus: () => FocusScope;
  readonly zoom: () => boolean;
  readonly keymapVisible: () => boolean;
  readonly subscribe: (cb: () => void) => () => void;
};

export class PaneService extends Context.Tag("PaneService")<
  PaneService,
  PaneShape
>() {}

export const PaneServiceLive = Layer.sync(PaneService, () => {
  let termCols = 80;
  let termRows = 24;
  let zoomed = false;
  let keymapVisibleFlag = true;
  let focusScope: FocusScope = "procs";
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const l of listeners) l();
  };

  const layout = (): Layout => {
    const keymapH = keymapVisibleFlag ? KEYMAP_BAR_HEIGHT : 0;
    const contentH = Math.max(0, termRows - keymapH);
    if (zoomed) {
      return {
        procsList: { x: 0, y: 0, width: 0, height: 0 },
        output: { x: 0, y: 0, width: termCols, height: contentH },
        keymap: { x: 0, y: contentH, width: termCols, height: keymapH },
        zoom: true,
      };
    }
    const procsW = Math.min(PROCS_LIST_WIDTH, Math.max(0, termCols - 1));
    return {
      procsList: { x: 0, y: 0, width: procsW, height: contentH },
      output: {
        x: procsW,
        y: 0,
        width: Math.max(0, termCols - procsW),
        height: contentH,
      },
      keymap: { x: 0, y: contentH, width: termCols, height: keymapH },
      zoom: false,
    };
  };

  return {
    setTerminalSize: (cols, rows) => {
      termCols = cols;
      termRows = rows;
      notify();
    },
    setFocus: (s) => {
      focusScope = s;
      notify();
    },
    toggleFocus: () => {
      focusScope =
        focusScope === "output-interactive" ? "procs" : "output-interactive";
      notify();
    },
    setZoom: (z) => {
      zoomed = z;
      notify();
    },
    toggleZoom: () => {
      zoomed = !zoomed;
      notify();
    },
    toggleKeymap: () => {
      keymapVisibleFlag = !keymapVisibleFlag;
      notify();
    },
    outputSize: () => {
      const l = layout();
      return { cols: l.output.width, rows: l.output.height };
    },
    layout,
    focus: () => focusScope,
    zoom: () => zoomed,
    keymapVisible: () => keymapVisibleFlag,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
});
