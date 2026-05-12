export type ProcArg = { readonly name: string; readonly shell: string };

export type CliResult =
  | { readonly kind: "help" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ok"; readonly procs: readonly ProcArg[] };

export const USAGE = `Usage: tprocs [--names a,b,c] "cmd1" "cmd2" ...

Each positional arg is a shell command run under bash. --names assigns
display names to commands in positional order.`;

export const parseCli = (argv: readonly string[]): CliResult => {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { kind: "help" };
  }

  const remaining = [...argv];
  const commands: string[] = [];
  const names: string[] = [];

  while (remaining.length > 0) {
    const a = remaining.shift()!;
    if (a === "--names" || a === "-n") {
      const next = remaining.shift();
      if (!next)
        return {
          kind: "error",
          message: `${a} requires an argument (comma-separated names)`,
        };
      names.push(
        ...next
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      continue;
    }
    commands.push(a);
  }

  if (commands.length === 0)
    return {
      kind: "error",
      message: "at least one command is required",
    };

  return {
    kind: "ok",
    procs: commands.map((shell, i) => ({
      name: names[i] ?? shell,
      shell,
    })),
  };
};
