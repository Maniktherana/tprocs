import { describe, expect, it } from "bun:test";
import { spawn as spawnPty, type IPty } from "bun-pty";
import { Ghostty } from "../src/ghostty";
import { ColorKind, Terminal, type TerminalOptions } from "../src/terminal";

// Each setup test gets its own Terminal; share one wasm load.
let ghosttyPromise: Promise<Ghostty> | null = null;
const createTerm = async (opts: TerminalOptions): Promise<Terminal> => {
  ghosttyPromise ??= Ghostty.load();
  const ghostty = await ghosttyPromise;
  return Terminal.create(ghostty, opts);
};

describe("libghostty WASM (via in-tree bindings)", () => {
  it("loads, parses bytes, and reports alt-screen transitions", async () => {
    const term = await createTerm({ cols: 80, rows: 24 });

    term.feed("hello\n");
    expect(term.cell(0, 0).char).toBe("h".codePointAt(0)!);
    expect(term.cell(0, 4).char).toBe("o".codePointAt(0)!);
    expect(term.cursor().row).toBe(1);
    expect(term.usingAltScreen).toBe(false);

    term.feed("\x1b[?1049h");
    expect(term.usingAltScreen).toBe(true);

    term.feed("\x1b[?1049l");
    expect(term.usingAltScreen).toBe(false);
  });

  it("decodes 24-bit color SGR", async () => {
    const term = await createTerm({ cols: 80, rows: 24 });
    term.feed("\x1b[38;2;255;0;0mR\x1b[0m");
    const cell = term.cell(0, 0);
    expect(cell.char).toBe("R".codePointAt(0)!);
    expect(cell.fg).toEqual({ kind: ColorKind.RGB, value: 0xff_00_00 });
  });

  it("preserves palette index for 8/16/256-color SGR (terminal passthrough)", async () => {
    const term = await createTerm({ cols: 80, rows: 24 });
    // SGR 31 = palette slot 1 (ANSI red); SGR 38;5;202 = 256-color slot 202.
    term.feed("\x1b[31mR\x1b[0m\x1b[38;5;202mO\x1b[0m");
    const r = term.cell(0, 0);
    const o = term.cell(0, 1);
    expect(r.fg).toEqual({ kind: ColorKind.PALETTE, value: 1 });
    expect(o.fg).toEqual({ kind: ColorKind.PALETTE, value: 202 });
  });

  it("leaves untouched cells as DEFAULT-kind so the host terminal applies its bg/fg", async () => {
    const term = await createTerm({ cols: 80, rows: 24 });
    term.feed("x");
    const c = term.cell(0, 0);
    expect(c.fg.kind).toBe(ColorKind.DEFAULT);
    expect(c.bg.kind).toBe(ColorKind.DEFAULT);
  });

  it("reports hasMouseTracking when the child enables ?1000h/?1002h/?1003h", async () => {
    const term = await createTerm({ cols: 80, rows: 24 });
    expect(term.hasMouseTracking).toBe(false);

    term.feed("\x1B[?1000h");
    expect(term.hasMouseTracking).toBe(true);
    term.feed("\x1B[?1000l");
    expect(term.hasMouseTracking).toBe(false);

    term.feed("\x1B[?1002h");
    expect(term.hasMouseTracking).toBe(true);
    term.feed("\x1B[?1002l");
    expect(term.hasMouseTracking).toBe(false);

    term.feed("\x1B[?1003h");
    expect(term.hasMouseTracking).toBe(true);
    term.feed("\x1B[?1003l");
    expect(term.hasMouseTracking).toBe(false);
  });

  it("exposes scrollback content", async () => {
    const term = await createTerm({ cols: 80, rows: 24 });
    for (let i = 1; i <= 30; i++) term.feed(`line ${i}\r\n`);
    expect(term.scrollbackCount).toBeGreaterThan(0);
    // offset 0 = newest scrollback line
    const newest = term.scrollbackLine(0);
    const text = newest.map((c) => String.fromCodePoint(c.char || 32)).join("").trimEnd();
    // line 30 ends up in the viewport (last printed); newest scrollback line
    // is whatever overflowed first into history.
    expect(text).toMatch(/^line \d+$/);
  });

  it("keeps scrollback past the old fixed 10k default", async () => {
    const term = await createTerm({ cols: 20, rows: 4 });
    for (let i = 1; i <= 10_080; i++) term.feed(`line ${i}\r\n`);
    expect(term.scrollbackCount).toBeGreaterThan(10_000);
  });
});

const spawnEcho = (script: string) =>
  spawnPty("bash", ["-lc", script], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
  });

const collectUntilExit = (child: IPty) =>
  new Promise<{ output: string; exitCode: number }>((resolve) => {
    const chunks: string[] = [];
    child.onData((d) => chunks.push(d));
    child.onExit(({ exitCode }) => resolve({ output: chunks.join(""), exitCode }));
  });

describe("bun-pty", () => {
  it("spawns a child, captures output, and exits 0", async () => {
    // 50ms head start so the onData/onExit listeners attach before printf runs.
    const { output, exitCode } = await collectUntilExit(
      spawnEcho("sleep 0.05; printf hello-from-pty"),
    );
    expect(exitCode).toBe(0);
    expect(output).toContain("hello-from-pty");
  });
});

describe("PTY -> libghostty integration", () => {
  it("feeds child output into the terminal and reads it back from the cell grid", async () => {
    const child = spawnEcho("sleep 0.05; printf hello");
    const term = await createTerm({ cols: 80, rows: 24 });
    child.onData((d) => term.feed(d));
    await new Promise<void>((resolve) => child.onExit(() => resolve()));

    const row0 = Array.from({ length: 5 }, (_, c) =>
      String.fromCodePoint(term.cell(0, c).char),
    ).join("");
    expect(row0).toBe("hello");
  });
});
