export type ProcArg = { readonly name: string; readonly shell: string };

export type CliResult =
  | { readonly kind: "help" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "ok";
      readonly procs: readonly ProcArg[];
      readonly scrollbackLimit: number;
    };

export const USAGE = `Usage: tprocs [--names a,b,c] [--scrollback bytes|unlimited] "cmd1" "cmd2" ...

Each positional arg is a shell command run under bash. --names assigns
display names to commands in positional order. Scrollback defaults to unlimited.`;

const parseScrollbackLimit = (value: string): number | null => {
  if (value === "unlimited" || value === "none") return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
};

export const parseCli = (argv: readonly string[]): CliResult => {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { kind: "help" };
  }

  const remaining = [...argv];
  const commands: string[] = [];
  const names: string[] = [];
  let scrollbackLimit = 0;

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
    if (a === "--scrollback") {
      const next = remaining.shift();
      if (!next)
        return {
          kind: "error",
          message: `${a} requires an argument (byte count or unlimited)`,
        };
      const parsed = parseScrollbackLimit(next);
      if (parsed === null)
        return {
          kind: "error",
          message: `${a} must be a non-negative byte count or unlimited`,
        };
      scrollbackLimit = parsed;
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
    scrollbackLimit,
    procs: commands.map((shell, i) => ({
      name: names[i] ?? shell,
      shell,
    })),
  };
};
