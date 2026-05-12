import { describe, expect, it } from "bun:test";
import { TextAttributes } from "@opentui/core";
import { CellFlags, type Cell } from "../src/terminal";
import { chunksForLine } from "../src/views/styled-line";

const fg = (c: Partial<Cell> & Pick<Cell, "char">): Cell => ({
  fg: 0xff_ff_ff,
  bg: 0x00_00_00,
  flags: 0,
  ...c,
});

describe("chunksForLine", () => {
  it("collapses contiguous cells with identical style into one chunk", () => {
    const cells: Cell[] = "hello".split("").map((ch) =>
      fg({ char: ch.codePointAt(0)! }),
    );
    const chunks = chunksForLine(cells, 0xff_ff_ff, 0x00_00_00);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe("hello");
  });

  it("splits at any change in fg, bg, or flags", () => {
    const cells: Cell[] = [
      fg({ char: 65 }), // 'A' default
      fg({ char: 66, fg: 0xff_00_00 }), // 'B' red fg
      fg({ char: 67, fg: 0xff_00_00, flags: CellFlags.BOLD }), // 'C' red bold
      fg({ char: 68, fg: 0xff_00_00, flags: CellFlags.BOLD }), // 'D' red bold
      fg({ char: 69, bg: 0x00_00_ff, fg: 0xff_00_00, flags: CellFlags.BOLD }), // 'E' new bg
    ];
    const chunks = chunksForLine(cells, 0xff_ff_ff, 0x00_00_00);
    expect(chunks.map((c) => c.text)).toEqual(["A", "B", "CD", "E"]);
  });

  it("omits fg/bg fields for cells matching defaults", () => {
    const cells: Cell[] = [fg({ char: 88 })];
    const chunks = chunksForLine(cells, 0xff_ff_ff, 0x00_00_00);
    expect(chunks[0]!.fg).toBeUndefined();
    expect(chunks[0]!.bg).toBeUndefined();
    expect(chunks[0]!.attributes).toBeUndefined();
  });

  it("maps CellFlags to TextAttributes for bold+italic+underline", () => {
    const flags =
      CellFlags.BOLD | CellFlags.ITALIC | CellFlags.UNDERLINE;
    const chunks = chunksForLine(
      [fg({ char: 88, flags })],
      0xff_ff_ff,
      0x00_00_00,
    );
    const expected =
      TextAttributes.BOLD | TextAttributes.ITALIC | TextAttributes.UNDERLINE;
    expect(chunks[0]!.attributes).toBe(expected);
  });

  it("maps FAINT to DIM and INVERSE to INVERSE", () => {
    const chunks = chunksForLine(
      [
        fg({ char: 88, flags: CellFlags.FAINT }),
        fg({ char: 89, flags: CellFlags.INVERSE }),
      ],
      0xff_ff_ff,
      0x00_00_00,
    );
    expect(chunks[0]!.attributes).toBe(TextAttributes.DIM);
    expect(chunks[1]!.attributes).toBe(TextAttributes.INVERSE);
  });

  it("emits a per-cell rgba object for non-default fg", () => {
    const chunks = chunksForLine(
      [fg({ char: 88, fg: 0xff_00_00 })],
      0xff_ff_ff,
      0x00_00_00,
    );
    expect(chunks[0]!.fg).toBeDefined();
    expect(chunks[0]!.fg!.r).toBeCloseTo(1);
    expect(chunks[0]!.fg!.g).toBeCloseTo(0);
    expect(chunks[0]!.fg!.b).toBeCloseTo(0);
  });

  it("applies INVERSE on cells inside the highlight range", () => {
    const cells: Cell[] = "abcde".split("").map((ch) =>
      fg({ char: ch.codePointAt(0)! }),
    );
    const chunks = chunksForLine(cells, 0xff_ff_ff, 0x00_00_00, {
      start: 1,
      end: 4,
    });
    expect(chunks.map((c) => c.text)).toEqual(["a", "bcd", "e"]);
    expect(chunks[0]!.attributes ?? 0).toBe(0);
    expect(chunks[1]!.attributes).toBe(TextAttributes.INVERSE);
    expect(chunks[2]!.attributes ?? 0).toBe(0);
  });

  it("ORs INVERSE on top of existing flags inside the highlight range", () => {
    const chunks = chunksForLine(
      [fg({ char: 65, flags: CellFlags.BOLD })],
      0xff_ff_ff,
      0x00_00_00,
      { start: 0, end: 1 },
    );
    expect(chunks[0]!.attributes).toBe(
      TextAttributes.BOLD | TextAttributes.INVERSE,
    );
  });

  it("pads with blank cells when the highlight runs past end-of-line", () => {
    const chunks = chunksForLine(
      [fg({ char: 65 }), fg({ char: 66 })],
      0xff_ff_ff,
      0x00_00_00,
      { start: 0, end: 5 },
    );
    expect(chunks.map((c) => c.text).join("")).toBe("AB   ");
    expect(chunks.every((c) => c.attributes === TextAttributes.INVERSE)).toBe(true);
  });
});
