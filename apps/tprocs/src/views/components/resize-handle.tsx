import { useState } from "react";
import { theme } from "../theme";

type Props = { readonly active: boolean };

const borderColor = (hover: boolean, active: boolean): string => {
  if (active) return theme.borderActive;
  if (hover) return theme.borderHover;
  return theme.borderIdle;
};

export function ResizeHandle({ active }: Props) {
  const [hover, setHover] = useState(false);
  return (
    <box
      width={1}
      border={["left"]}
      borderStyle="heavy"
      borderColor={borderColor(hover, active)}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
    />
  );
}
