import { describe, expect, it } from "bun:test";
import {
  dragScrollIntent,
  verticalDirection,
  wheelLines,
  WHEEL_LINES_PER_TICK,
} from "../src/views/output-scroll";

describe("output scroll policy", () => {
  it("only treats vertical wheel directions as terminal output scrolling", () => {
    expect(verticalDirection("up")).toBe("up");
    expect(verticalDirection("down")).toBe("down");
    expect(verticalDirection("left")).toBeNull();
  });

  it("maps each wheel tick to a fixed scroll speed without acceleration", () => {
    expect(wheelLines(1)).toBe(WHEEL_LINES_PER_TICK);
    expect(wheelLines(2)).toBe(WHEEL_LINES_PER_TICK * 2);
  });

  it("uses small fixed drag autoscroll tiers at the pane edges", () => {
    expect(dragScrollIntent(4, 10)).toBeNull();
    expect(dragScrollIntent(2, 10)).toMatchObject({
      direction: -1,
      linesPerSecond: 6,
    });
    expect(dragScrollIntent(1, 10)).toMatchObject({
      direction: -1,
      linesPerSecond: 36,
    });
    expect(dragScrollIntent(0, 10)).toMatchObject({
      direction: -1,
      linesPerSecond: 72,
    });
    expect(dragScrollIntent(7, 10)).toMatchObject({
      direction: 1,
      linesPerSecond: 6,
    });
    expect(dragScrollIntent(9, 10)).toMatchObject({
      direction: 1,
      linesPerSecond: 72,
    });
  });
});
