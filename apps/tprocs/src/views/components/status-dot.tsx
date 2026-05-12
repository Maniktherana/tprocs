import type { ProcStatus } from "../../services/process-manager";
import { statusColors } from "../status";

type Props = { readonly status: ProcStatus | undefined };

export function StatusDot({ status }: Props) {
  return <text fg={statusColors(status).fg}>■</text>;
}
