import { Chip } from "./components/chip";
import { KeymapHint } from "./components/keymap-hint";
import { useRenderTick, useServices } from "./services-context";
import { statusColors, statusLabel } from "./status";
import { theme } from "./theme";

const PROCS_HINTS: readonly { key: string; label: string }[] = [
  { key: "j/k", label: "navigate" },
  { key: "C-a", label: "focus output" },
  { key: "s", label: "start" },
  { key: "x", label: "stop" },
  { key: "r", label: "restart" },
  { key: "z", label: "zoom" },
  { key: ":", label: "menu" },
  { key: "q", label: "quit" },
];

const INTERACTIVE_HINTS: readonly { key: string; label: string }[] = [
  { key: "Esc", label: "leave" },
  { key: "C-a", label: "leave" },
];

const MODE_INTERACT = { fg: theme.blue, bg: theme.blueBg } as const;
const MODE_VIEW = { fg: theme.yellow, bg: theme.yellowBg } as const;

export function KeymapBar() {
  useRenderTick();
  const { pane, pm } = useServices();
  if (!pane.keymapVisible()) return null;

  const proc = pm.current();
  const interactive = pane.focus() === "output-interactive";
  const hints = interactive ? INTERACTIVE_HINTS : PROCS_HINTS;
  const mode = interactive ? MODE_INTERACT : MODE_VIEW;
  const status = statusColors(proc?.status);

  return (
    <box flexDirection="row" flexGrow={1} backgroundColor={theme.bgPanel}>
      <Chip fg={status.fg} bg={status.bg} text={statusLabel(proc?.status)} />
      <Chip
        fg={mode.fg}
        bg={mode.bg}
        text={interactive ? "INTERACT" : "VIEW"}
      />
      <Chip fg={theme.fg} bg={theme.bgRow} text={proc ? proc.name : "—"} />
      <box flexGrow={1} />
      <box flexDirection="row" paddingX={1}>
        {hints.map((h, i) => (
          <KeymapHint
            key={i}
            hintKey={h.key}
            label={h.label}
            leadingSpace={i > 0}
          />
        ))}
      </box>
    </box>
  );
}
