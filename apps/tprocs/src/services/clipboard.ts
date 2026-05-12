import { Context, Effect, Layer } from "effect";

type Provider =
  | { readonly kind: "exec"; readonly cmd: string; readonly args: readonly string[] }
  | { readonly kind: "osc52" };

const has = (cmd: string): boolean => Bun.which(cmd) !== null;

export const detectProvider = (
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Provider => {
  if (platform === "darwin" && has("pbcopy"))
    return { kind: "exec", cmd: "pbcopy", args: [] };

  if (env.WAYLAND_DISPLAY && has("wl-copy"))
    return { kind: "exec", cmd: "wl-copy", args: ["--type", "text/plain"] };

  if (env.DISPLAY) {
    if (has("xclip"))
      return { kind: "exec", cmd: "xclip", args: ["-i", "-selection", "clipboard"] };
    if (has("xsel"))
      return { kind: "exec", cmd: "xsel", args: ["-i", "-b"] };
  }

  if (has("termux-clipboard-set"))
    return { kind: "exec", cmd: "termux-clipboard-set", args: [] };

  if (env.TMUX && has("tmux"))
    return { kind: "exec", cmd: "tmux", args: ["load-buffer", "-"] };

  return { kind: "osc52" };
};

export const encodeOSC52 = (text: string): string => {
  const b64 = Buffer.from(text, "utf-8").toString("base64");
  return `\x1b]52;;${b64}\x07`;
};

const runProvider = async (
  provider: Provider,
  text: string,
): Promise<void> => {
  if (provider.kind === "osc52") {
    process.stdout.write(encodeOSC52(text));
    return;
  }
  const proc = Bun.spawn([provider.cmd, ...provider.args], {
    stdin: "pipe",
    stdout: "ignore",
    stderr: "ignore",
  });
  proc.stdin.write(text);
  proc.stdin.end();
  await proc.exited;
};

export type ClipboardShape = {
  readonly copy: (text: string) => Effect.Effect<void>;
  readonly provider: Provider;
};

export class Clipboard extends Context.Tag("Clipboard")<
  Clipboard,
  ClipboardShape
>() {}

export const ClipboardLive = Layer.sync(Clipboard, () => {
  const provider = detectProvider();
  return {
    copy: (text) => Effect.promise(() => runProvider(provider, text)),
    provider,
  };
});
