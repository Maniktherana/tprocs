import { describe, expect, it } from "bun:test";
import {
  highlightRangeForLineId,
  type AbsSelection,
} from "../src/views/lookup";

const sel = (
  anchorLine: number,
  anchorCol: number,
  focusLine: number,
  focusCol: number,
): AbsSelection => ({
  anchor: { lineId: anchorLine, col: anchorCol },
  focus: { lineId: focusLine, col: focusCol },
});

describe("highlightRangeForLineId", () => {
  const COLS = 80;

  it("single-line forward drag yields the col range, half-open", () => {
    expect(highlightRangeForLineId(sel(4, 10, 4, 20), 4, COLS)).toEqual({
      start: 10,
      end: 21,
    });
  });

  it("single-line reverse drag normalises cols", () => {
    expect(highlightRangeForLineId(sel(4, 20, 4, 10), 4, COLS)).toEqual({
      start: 10,
      end: 21,
    });
  });

  it("multi-line: first line runs from startCol to EOL", () => {
    expect(highlightRangeForLineId(sel(1, 5, 3, 10), 1, COLS)).toEqual({
      start: 5,
      end: COLS,
    });
  });

  it("multi-line: middle line is full width", () => {
    expect(highlightRangeForLineId(sel(1, 5, 3, 10), 2, COLS)).toEqual({
      start: 0,
      end: COLS,
    });
  });

  it("multi-line: last line runs from 0 through endCol", () => {
    expect(highlightRangeForLineId(sel(1, 5, 3, 10), 3, COLS)).toEqual({
      start: 0,
      end: 11,
    });
  });

  it("upward drag (anchor below focus) flips orientation", () => {
    expect(highlightRangeForLineId(sel(5, 8, 2, 1), 2, COLS)).toEqual({
      start: 1,
      end: COLS,
    });
    expect(highlightRangeForLineId(sel(5, 8, 2, 1), 5, COLS)).toEqual({
      start: 0,
      end: 9,
    });
  });

  it("returns null outside the selected line range", () => {
    expect(highlightRangeForLineId(sel(1, 0, 2, 5), 0, COLS)).toBeNull();
    expect(highlightRangeForLineId(sel(1, 0, 2, 5), 3, COLS)).toBeNull();
  });
});
