import type { ProcState } from "../services/process-manager";
import { StatusDot } from "./components/status-dot";
import { useRenderTick, useServices } from "./services-context";
import { theme } from "./theme";

type ProcRowProps = {
  readonly proc: ProcState;
  readonly selected: boolean;
  readonly width: number;
  readonly onSelect: () => void;
};

const ROW_PAD = 2; // paddingX={1} on each side
const MARKER = 2; // "› " or "  "
const DOT = 2; // " ■"

const truncate = (s: string, max: number): string => {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  if (max === 1) return "…";
  return s.slice(0, max - 1) + "…";
};

function ProcRow({ proc, selected, width, onSelect }: ProcRowProps) {
  const nameMax = Math.max(0, width - ROW_PAD - MARKER - DOT);
  return (
    <box
      flexDirection="row"
      paddingX={1}
      backgroundColor={selected ? theme.bgRow : theme.bgPanel}
      onMouseDown={onSelect}
    >
      <text fg={selected ? theme.fgActive : theme.fgDim}>
        {selected ? "› " : "  "}
      </text>
      <text>{truncate(proc.name, nameMax)}</text>
      <box flexGrow={1} />
      <StatusDot status={proc.status} />
    </box>
  );
}

export function ProcsList() {
  useRenderTick();
  const { pm, pane } = useServices();
  const procs = pm.procs();
  const currentId = pm.currentId();
  const width = pane.procsListWidth();

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      paddingY={0.5}
      backgroundColor={theme.bgPanel}
    >
      {procs.map((p: ProcState) => (
        <ProcRow
          key={p.id}
          proc={p}
          selected={p.id === currentId}
          width={width}
          onSelect={() => {
            pm.selectById(p.id);
            pane.setFocus("procs");
          }}
        />
      ))}
    </box>
  );
}
