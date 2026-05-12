import { TextAttributes } from "@opentui/core";
import { theme } from "../theme";

type Props = {
  readonly hintKey: string;
  readonly label: string;
  readonly leadingSpace: boolean;
};

export function KeymapHint({ hintKey, label, leadingSpace }: Props) {
  return (
    <text>
      {leadingSpace ? "  " : ""}
      <span fg={theme.fgActive} attributes={TextAttributes.BOLD}>
        {hintKey}
      </span>{" "}
      <span fg={theme.fgDim}>{label}</span>
    </text>
  );
}
