export type AppCommand =
  | { kind: "quit" }
  | { kind: "force-quit" }
  | { kind: "toggle-focus" }
  | { kind: "focus-procs" }
  | { kind: "focus-output" }
  | { kind: "enter-interactive" }
  | { kind: "exit-interactive" }
  | { kind: "next-proc" }
  | { kind: "prev-proc" }
  | { kind: "select-proc-index"; index: number }
  | { kind: "start-current" }
  | { kind: "stop-current" }
  | { kind: "kill-current" }
  | { kind: "restart-current" }
  | { kind: "force-restart-current" }
  | { kind: "pause-current" }
  | { kind: "resume-current" }
  | { kind: "toggle-zoom" }
  | { kind: "toggle-keymap" }
  | { kind: "open-menu" }
  | { kind: "close-menu" }
  | { kind: "scroll-up-lines"; lines: number }
  | { kind: "scroll-down-lines"; lines: number }
  | { kind: "scroll-up-half" }
  | { kind: "scroll-down-half" }
  | { kind: "scroll-to-tail" };

export const COMMAND_TITLES: Readonly<Record<AppCommand["kind"], string>> = {
  quit: "Quit (graceful)",
  "force-quit": "Force quit",
  "toggle-focus": "Toggle focus between procs and output",
  "focus-procs": "Focus procs list",
  "focus-output": "Focus output pane (scroll mode)",
  "enter-interactive": "Send input to process (interactive mode)",
  "exit-interactive": "Leave interactive mode",
  "next-proc": "Next process",
  "prev-proc": "Previous process",
  "select-proc-index": "Select process by index",
  "start-current": "Start selected process",
  "stop-current": "Stop selected process (SIGTERM)",
  "kill-current": "Kill selected process (SIGKILL)",
  "restart-current": "Restart selected process",
  "force-restart-current": "Force restart selected process",
  "pause-current": "Pause selected process (SIGSTOP)",
  "resume-current": "Resume selected process (SIGCONT)",
  "toggle-zoom": "Zoom output pane",
  "toggle-keymap": "Toggle keymap help",
  "open-menu": "Open commands menu",
  "close-menu": "Close commands menu",
  "scroll-up-lines": "Scroll up N lines",
  "scroll-down-lines": "Scroll down N lines",
  "scroll-up-half": "Scroll up half a page",
  "scroll-down-half": "Scroll down half a page",
  "scroll-to-tail": "Jump to bottom of scrollback",
};
