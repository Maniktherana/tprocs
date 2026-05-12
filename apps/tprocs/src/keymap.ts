import type { KeyEvent } from "@opentui/core";
import type { AppCommand } from "./commands";
import type { FocusScope } from "./services/pane";

export const keyToBinding = (e: KeyEvent): string => {
  const parts: string[] = [];
  if (e.ctrl) parts.push("C");
  if (e.meta || e.option) parts.push("M");
  if (e.shift && e.name.length > 1) parts.push("S");
  parts.push(e.name);
  return parts.join("-");
};

type Keymap = Readonly<Record<string, AppCommand>>;

/**
 * Procs (default) scope. All app shortcuts live here: proc nav, lifecycle,
 * output scroll (acts on selected proc), menu, quit, zoom, etc. Keyboard
 * never reaches the child process in this scope.
 */
const procsKeymap: Keymap = {
  q: { kind: "quit" },
  Q: { kind: "force-quit" },

  j: { kind: "next-proc" },
  down: { kind: "next-proc" },
  k: { kind: "prev-proc" },
  up: { kind: "prev-proc" },

  "M-1": { kind: "select-proc-index", index: 0 },
  "M-2": { kind: "select-proc-index", index: 1 },
  "M-3": { kind: "select-proc-index", index: 2 },
  "M-4": { kind: "select-proc-index", index: 3 },
  "M-5": { kind: "select-proc-index", index: 4 },
  "M-6": { kind: "select-proc-index", index: 5 },
  "M-7": { kind: "select-proc-index", index: 6 },
  "M-8": { kind: "select-proc-index", index: 7 },

  s: { kind: "start-current" },
  x: { kind: "stop-current" },
  X: { kind: "kill-current" },
  r: { kind: "restart-current" },
  R: { kind: "force-restart-current" },
  space: { kind: "pause-current" },
  "C-space": { kind: "resume-current" },

  z: { kind: "toggle-zoom" },
  "?": { kind: "toggle-keymap" },
  ":": { kind: "open-menu" },

  // Scroll the output of the currently selected proc.
  "C-d": { kind: "scroll-down-half" },
  "C-u": { kind: "scroll-up-half" },
  pagedown: { kind: "scroll-down-half" },
  pageup: { kind: "scroll-up-half" },
  "C-e": { kind: "scroll-down-lines", lines: 3 },
  "C-y": { kind: "scroll-up-lines", lines: 3 },
  G: { kind: "scroll-to-tail" },

  // Enter interactive mode on the selected proc.
  i: { kind: "enter-interactive" },
  return: { kind: "enter-interactive" },
  "C-a": { kind: "enter-interactive" },
};

/**
 * Interactive scope. Only Esc / Ctrl-A escape; everything else falls
 * through to the PTY in input-router.
 */
const outputInteractiveKeymap: Keymap = {
  escape: { kind: "exit-interactive" },
  "C-a": { kind: "exit-interactive" },
};

const menuKeymap: Keymap = {
  escape: { kind: "close-menu" },
};

export const resolveKey = (
  scope: FocusScope,
  event: KeyEvent,
): AppCommand | null => {
  const binding = keyToBinding(event);
  const map =
    scope === "menu"
      ? menuKeymap
      : scope === "output-interactive"
        ? outputInteractiveKeymap
        : procsKeymap;
  return map[binding] ?? null;
};
