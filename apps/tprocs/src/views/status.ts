import type { ProcStatus } from "../services/process-manager";
import { theme } from "./theme";

export type StatusColors = { readonly fg: string; readonly bg: string };

export const statusColors = (s: ProcStatus | undefined): StatusColors => {
  if (s?.kind === "running") return { fg: theme.green, bg: theme.greenBg };
  if (s?.kind === "paused") return { fg: theme.yellow, bg: theme.yellowBg };
  if (s?.kind === "exited") return { fg: theme.red, bg: theme.redBg };
  return { fg: theme.fgDim, bg: theme.bgPanel };
};

export const statusLabel = (s: ProcStatus | undefined): string => {
  if (!s) return "—";
  if (s.kind === "running") return "UP";
  if (s.kind === "paused") return "PAUSED";
  if (s.kind === "exited") return `DOWN [${s.exitCode}]`;
  return "IDLE";
};
