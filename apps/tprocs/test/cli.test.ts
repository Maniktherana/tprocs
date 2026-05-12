import { describe, expect, it } from "bun:test";
import { parseCli } from "../src/cli";

describe("parseCli", () => {
  it("returns help when no args / --help / -h", () => {
    expect(parseCli([]).kind).toBe("help");
    expect(parseCli(["--help"]).kind).toBe("help");
    expect(parseCli(["-h"]).kind).toBe("help");
  });

  it("turns positional args into procs named after the command", () => {
    const r = parseCli(["echo hi", "ls -la"]);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok")
      expect(r.procs).toEqual([
        { name: "echo hi", shell: "echo hi" },
        { name: "ls -la", shell: "ls -la" },
      ]);
  });

  it("applies --names in positional order; falls back to the command otherwise", () => {
    const r = parseCli(["--names", "dev,test", "bun dev", "jest -w", "ls"]);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok")
      expect(r.procs).toEqual([
        { name: "dev", shell: "bun dev" },
        { name: "test", shell: "jest -w" },
        { name: "ls", shell: "ls" },
      ]);
  });

  it("accepts -n as a short alias", () => {
    const r = parseCli(["-n", "a,b", "echo a", "echo b"]);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.procs.map((p) => p.name)).toEqual(["a", "b"]);
  });

  it("defaults scrollback to unlimited and accepts an explicit cap", () => {
    const unlimited = parseCli(["echo hi"]);
    expect(unlimited.kind).toBe("ok");
    if (unlimited.kind === "ok") expect(unlimited.scrollbackLimit).toBe(0);

    const capped = parseCli(["--scrollback", "50000", "echo hi"]);
    expect(capped.kind).toBe("ok");
    if (capped.kind === "ok") expect(capped.scrollbackLimit).toBe(50000);
  });

  it("errors when --names has no value", () => {
    const r = parseCli(["--names"]);
    expect(r.kind).toBe("error");
  });

  it("errors when --scrollback is invalid", () => {
    expect(parseCli(["--scrollback"]).kind).toBe("error");
    expect(parseCli(["--scrollback", "-1", "echo hi"]).kind).toBe("error");
    expect(parseCli(["--scrollback", "nope", "echo hi"]).kind).toBe("error");
  });

  it("errors when no positional commands were supplied", () => {
    const r = parseCli(["--names", "a,b"]);
    expect(r.kind).toBe("error");
  });
});
