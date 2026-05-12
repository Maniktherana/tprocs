import { describe, expect, it } from "bun:test";
import { TextAttributes } from "@opentui/core";
import { CellFlags, ColorKind, type Cell, type CellColor } from "../src/terminal";
import { chunksForLine } from "../src/views/styled-line";

const DEFAULT: CellColor = { kind: ColorKind.DEFAULT, value: 0 };
const rgb = (value: number): CellColor => ({ kind: ColorKind.RGB, value });
const palette = (slot: number): CellColor => ({ kind: ColorKind.PALETTE, value: slot });

const cell = (overrides: Partial<Cell> & Pick<Cell, "char">): Cell => ({
  fg: DEFAULT,
  bg: DEFAULT,
  flags: 0,
  ...overrides,
});

describe("chunksForLine", () => {
  it("collapses contiguous cells with identical style into one chunk", () => {
    const cells: Cell[] = "hello".split("").map((ch) =>
      cell({ char: ch.codePointAt(0)! }),
    );
    const chunks = chunksForLine(cells);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe("hello");
  });

  it("splits at any change in fg, bg, or flags", () => {
    const cells: Cell[] = [
      cell({ char: 65 }),
      cell({ char: 66, fg: rgb(0xff_00_00) }),
      cell({ char: 67, fg: rgb(0xff_00_00), flags: CellFlags.BOLD }),
      cell({ char: 68, fg: rgb(0xff_00_00), flags: CellFlags.BOLD }),
      cell({
        char: 69,
        bg: rgb(0x00_00_ff),
        fg: rgb(0xff_00_00),
        flags: CellFlags.BOLD,
      }),
    ];
    const chunks = chunksForLine(cells);
    expect(chunks.map((c) => c.text)).toEqual(["A", "B", "CD", "E"]);
  });

  it("omits fg/bg fields for cells with DEFAULT color kind", () => {
    const chunks = chunksForLine([cell({ char: 88 })]);
    expect(chunks[0]!.fg).toBeUndefined();
    expect(chunks[0]!.bg).toBeUndefined();
    expect(chunks[0]!.attributes).toBeUndefined();
  });

  it("maps CellFlags to TextAttributes for bold+italic+underline", () => {
    const flags = CellFlags.BOLD | CellFlags.ITALIC | CellFlags.UNDERLINE;
    const chunks = chunksForLine([cell({ char: 88, flags })]);
    const expected =
      TextAttributes.BOLD | TextAttributes.ITALIC | TextAttributes.UNDERLINE;
    expect(chunks[0]!.attributes).toBe(expected);
  });

  it("maps FAINT to DIM and INVERSE to INVERSE", () => {
    const chunks = chunksForLine([
      cell({ char: 88, flags: CellFlags.FAINT }),
      cell({ char: 89, flags: CellFlags.INVERSE }),
    ]);
    expect(chunks[0]!.attributes).toBe(TextAttributes.DIM);
    expect(chunks[1]!.attributes).toBe(TextAttributes.INVERSE);
  });

  it("emits a per-cell rgba object for non-default fg", () => {
    const chunks = chunksForLine([cell({ char: 88, fg: rgb(0xff_00_00) })]);
    expect(chunks[0]!.fg).toBeDefined();
    expect(chunks[0]!.fg!.r).toBeCloseTo(1);
    expect(chunks[0]!.fg!.g).toBeCloseTo(0);
    expect(chunks[0]!.fg!.b).toBeCloseTo(0);
  });

  it("emits indexed rgba for palette fg so the host terminal applies its own ANSI palette", () => {
    const chunks = chunksForLine([cell({ char: 88, fg: palette(1) })]);
    expect(chunks[0]!.fg).toBeDefined();
    expect(chunks[0]!.fg!.intent).toBe("indexed");
    expect(chunks[0]!.fg!.slot).toBe(1);
  });

  it("applies an indexed-palette highlight bg/fg to cells inside the range", () => {
    const cells: Cell[] = "abcde".split("").map((ch) =>
      cell({ char: ch.codePointAt(0)! }),
    );
    const chunks = chunksForLine(cells, { start: 1, end: 4 });
    expect(chunks.map((c) => c.text)).toEqual(["a", "bcd", "e"]);
    expect(chunks[0]!.bg).toBeUndefined();
    expect(chunks[1]!.bg).toBeDefined();
    expect(chunks[1]!.bg!.intent).toBe("indexed");
    expect(chunks[1]!.bg!.slot).toBe(8);
    expect(chunks[1]!.fg!.intent).toBe("indexed");
    expect(chunks[1]!.fg!.slot).toBe(15);
    expect(chunks[2]!.bg).toBeUndefined();
  });

  it("preserves the cell's own attribute flags inside the highlight range", () => {
    const chunks = chunksForLine(
      [cell({ char: 65, flags: CellFlags.BOLD })],
      { start: 0, end: 1 },
    );
    expect(chunks[0]!.attributes).toBe(TextAttributes.BOLD);
    expect(chunks[0]!.bg!.slot).toBe(8);
  });

  it("pads with blank cells when the highlight runs past end-of-line", () => {
    const chunks = chunksForLine(
      [cell({ char: 65 }), cell({ char: 66 })],
      { start: 0, end: 5 },
    );
    expect(chunks.map((c) => c.text).join("")).toBe("AB   ");
    expect(chunks.every((c) => c.bg?.slot === 8)).toBe(true);
  });
});
