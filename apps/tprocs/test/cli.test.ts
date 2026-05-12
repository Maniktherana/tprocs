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

  it("errors when --names has no value", () => {
    const r = parseCli(["--names"]);
    expect(r.kind).toBe("error");
  });

  it("errors when no positional commands were supplied", () => {
    const r = parseCli(["--names", "a,b"]);
    expect(r.kind).toBe("error");
  });
});
