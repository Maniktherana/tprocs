import { theme } from "../theme";

type Props = { readonly message: string };

export function Toast({ message }: Props) {
  return (
    <box
      position="absolute"
      bottom={0}
      right={1}
      paddingX={1}
      backgroundColor={theme.toastBg}
    >
      <text fg={theme.toastFg}>{message}</text>
    </box>
  );
}
