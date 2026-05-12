import { describe, expect, it } from "bun:test";
import {
  MAX_WHEEL_LINES_PER_FRAME,
  dragScrollIntent,
  queueWheelLines,
  verticalDirection,
} from "../src/views/output-scroll";

describe("output scroll policy", () => {
  it("only treats vertical wheel directions as terminal output scrolling", () => {
    expect(verticalDirection("up")).toBe("up");
    expect(verticalDirection("down")).toBe("down");
    expect(verticalDirection("left")).toBeNull();
  });

  it("caps wheel bursts to a predictable per-frame step", () => {
    expect(queueWheelLines(0, 1)).toBe(1);
    expect(queueWheelLines(2, 1)).toBe(MAX_WHEEL_LINES_PER_FRAME);
    expect(queueWheelLines(MAX_WHEEL_LINES_PER_FRAME, 1)).toBe(
      MAX_WHEEL_LINES_PER_FRAME,
    );
  });

  it("uses small fixed drag autoscroll tiers at the pane edges", () => {
    expect(dragScrollIntent(4, 10)).toBeNull();
    expect(dragScrollIntent(0, 10)).toMatchObject({ direction: -1, lines: 1 });
    expect(dragScrollIntent(9, 10)).toMatchObject({ direction: 1, lines: 1 });
    expect(dragScrollIntent(-4, 10)).toMatchObject({ direction: -1, lines: 2 });
    expect(dragScrollIntent(13, 10)).toMatchObject({ direction: 1, lines: 2 });
  });
});
