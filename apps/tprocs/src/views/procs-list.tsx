import { TextAttributes } from "@opentui/core";
import type { ProcState, ProcStatus } from "../services/process-manager";
import { useRenderTick, useServices } from "./services-context";

type ProcRowProps = {
  readonly proc: ProcState;
  readonly selected: boolean;
  readonly onSelect: () => void;
};

const statusLabel = (s: ProcStatus): string => {
  if (s.kind === "running") return " UP ";
  if (s.kind === "paused") return " PAUSED ";
  if (s.kind === "exited") return ` DOWN (${s.exitCode}) `;
  return " IDLE ";
};

const statusFg = (s: ProcStatus): string => {
  if (s.kind === "running") return "#4ade80";
  if (s.kind === "paused") return "#facc15";
  if (s.kind === "exited") return s.exitCode === 0 ? "#60a5fa" : "#f87171";
  return "#9ca3af";
};

function ProcRow({ proc, selected, onSelect }: ProcRowProps) {
  return (
    <box
      flexDirection="row"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={selected ? "#3f3f46" : undefined}
      onMouseDown={onSelect}
    >
      <text>
        {selected ? "› " : "  "}
        {proc.name}
      </text>
      <box flexGrow={1} />
      <text fg={statusFg(proc.status)} attributes={TextAttributes.BOLD}>
        {statusLabel(proc.status)}
      </text>
    </box>
  );
}

export function ProcsList() {
  useRenderTick();
  const { pm, pane } = useServices();
  const procs = pm.procs();
  const currentId = pm.currentId();

  return (
    <box flexDirection="column" flexGrow={1}>
      {procs.map((p: ProcState) => (
        <ProcRow
          key={p.id}
          proc={p}
          selected={p.id === currentId}
          onSelect={() => {
            pm.selectById(p.id);
            // Clicking the procs sidebar always exits interactive mode.
            pane.setFocus("procs");
          }}
        />
      ))}
    </box>
  );
}
