import { TextAttributes } from "@opentui/core";
import { useRenderTick, useServices } from "./services-context";

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
  { key: "Esc", label: "leave interact" },
  { key: "C-a", label: "leave interact" },
];

export function KeymapBar() {
  useRenderTick();
  const { pane } = useServices();
  if (!pane.keymapVisible()) return null;

  const hints =
    pane.focus() === "output-interactive" ? INTERACTIVE_HINTS : PROCS_HINTS;

  return (
    <box flexDirection="row" paddingLeft={1} paddingRight={1}>
      {hints.map((h, i) => (
        <text key={i}>
          {i > 0 ? "  " : ""}
          <span fg="#fbbf24" attributes={TextAttributes.BOLD}>
            {h.key}
          </span>{" "}
          {h.label}
        </text>
      ))}
    </box>
  );
}
