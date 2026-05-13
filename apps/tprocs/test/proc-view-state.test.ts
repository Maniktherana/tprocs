import { describe, expect, it } from "bun:test";
import {
  anchorViewAfterAppend,
  initialProcView,
  scrollViewDown,
  scrollViewToTail,
  scrollViewUp,
  topLineId,
} from "../src/services/proc-view-state";

describe("ProcViewState", () => {
  it("keeps follow-tail pinned when new scrollback arrives", () => {
    expect(anchorViewAfterAppend(initialProcView(), 3, 10)).toEqual({
      viewOffset: 0,
      followTail: true,
    });
  });

  it("anchors a scrolled-up view when new scrollback arrives", () => {
    expect(
      anchorViewAfterAppend(
        { viewOffset: 4, followTail: false },
        3,
        10,
      ),
    ).toEqual({
      viewOffset: 7,
      followTail: false,
    });
  });

  it("clamps upward scrolling to available scrollback", () => {
    expect(scrollViewUp(initialProcView(), 999, 12)).toEqual({
      viewOffset: 12,
      followTail: false,
    });
  });

  it("re-enters follow-tail only after scrolling back to the tail", () => {
    expect(
      scrollViewDown({ viewOffset: 10, followTail: false }, 4),
    ).toEqual({
      viewOffset: 6,
      followTail: false,
    });
    expect(
      scrollViewDown({ viewOffset: 10, followTail: false }, 999),
    ).toEqual(initialProcView());
  });

  it("resets directly to the tail", () => {
    expect(scrollViewToTail()).toEqual(initialProcView());
  });

  it("derives the top visible absolute line id from total rows and offset", () => {
    expect(topLineId({ viewOffset: 3, followTail: false }, 30, 10)).toBe(17);
    expect(topLineId(initialProcView(), 6, 10)).toBe(0);
  });
});
