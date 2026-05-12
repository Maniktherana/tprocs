import { describe, expect, it } from "bun:test";
import { highlightRangeForRow, normaliseRect } from "../src/views/lookup";

describe("normaliseRect", () => {
  it("sorts a forward (down-right) drag", () => {
    expect(
      normaliseRect({ startRow: 1, startCol: 2, endRow: 3, endCol: 4 }),
    ).toEqual({ startRow: 1, startCol: 2, endRow: 3, endCol: 4 });
  });

  it("flips cols too when the user drags upward (start below end)", () => {
    expect(
      normaliseRect({ startRow: 5, startCol: 8, endRow: 2, endCol: 1 }),
    ).toEqual({ startRow: 2, startCol: 1, endRow: 5, endCol: 8 });
  });
});

describe("highlightRangeForRow", () => {
  const COLS = 80;

  it("single-row drag returns the col range, half-open", () => {
    const r = highlightRangeForRow(
      { startRow: 4, startCol: 10, endRow: 4, endCol: 20 },
      4,
      COLS,
    );
    expect(r).toEqual({ start: 10, end: 21 });
  });

  it("single-row drag handles cols in reverse", () => {
    const r = highlightRangeForRow(
      { startRow: 4, startCol: 20, endRow: 4, endCol: 10 },
      4,
      COLS,
    );
    expect(r).toEqual({ start: 10, end: 21 });
  });

  it("multi-row: first row runs from startCol to EOL", () => {
    const r = highlightRangeForRow(
      { startRow: 1, startCol: 5, endRow: 3, endCol: 10 },
      1,
      COLS,
    );
    expect(r).toEqual({ start: 5, end: COLS });
  });

  it("multi-row: middle row is full width", () => {
    const r = highlightRangeForRow(
      { startRow: 1, startCol: 5, endRow: 3, endCol: 10 },
      2,
      COLS,
    );
    expect(r).toEqual({ start: 0, end: COLS });
  });

  it("multi-row: last row from 0 through endCol (inclusive)", () => {
    const r = highlightRangeForRow(
      { startRow: 1, startCol: 5, endRow: 3, endCol: 10 },
      3,
      COLS,
    );
    expect(r).toEqual({ start: 0, end: 11 });
  });

  it("returns null when the row is outside the selection", () => {
    expect(
      highlightRangeForRow(
        { startRow: 1, startCol: 0, endRow: 2, endCol: 5 },
        0,
        COLS,
      ),
    ).toBeNull();
    expect(
      highlightRangeForRow(
        { startRow: 1, startCol: 0, endRow: 2, endCol: 5 },
        3,
        COLS,
      ),
    ).toBeNull();
  });
});
