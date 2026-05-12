import { TextAttributes } from "@opentui/core";

type Props = {
  readonly fg: string;
  readonly bg: string;
  readonly text: string;
};

export function Chip({ fg, bg, text }: Props) {
  return (
    <box
      paddingX={1}
      backgroundColor={bg}
      border={["left"]}
      borderStyle="heavy"
      borderColor={fg}
    >
      <text fg={fg} attributes={TextAttributes.BOLD}>
        {text}
      </text>
    </box>
  );
}
