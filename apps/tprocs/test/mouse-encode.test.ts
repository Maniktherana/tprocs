import { describe, expect, it } from "bun:test";
import { encodeSgrMouse } from "../src/views/mouse-encode";

const noMods = { shift: false, alt: false, ctrl: false };

describe("encodeSgrMouse", () => {
  it("encodes a left-button press (1-based coords, trailing M)", () => {
    expect(
      encodeSgrMouse(
        { type: "down", button: 0, modifiers: noMods },
        4,
        9,
      ),
    ).toBe("\x1B[<0;10;5M");
  });

  it("encodes a left-button release with trailing m", () => {
    expect(
      encodeSgrMouse(
        { type: "up", button: 0, modifiers: noMods },
        0,
        0,
      ),
    ).toBe("\x1B[<0;1;1m");
  });

  it("adds the motion bit (32) for drag events", () => {
    expect(
      encodeSgrMouse(
        { type: "drag", button: 0, modifiers: noMods },
        2,
        2,
      ),
    ).toBe(`\x1B[<${0 | 32};3;3M`);
  });

  it("encodes wheel-up as 64 + 'M'", () => {
    expect(
      encodeSgrMouse(
        {
          type: "scroll",
          button: 0,
          modifiers: noMods,
          scroll: { direction: "up", delta: 1 },
        },
        5,
        5,
      ),
    ).toBe("\x1B[<64;6;6M");
  });

  it("encodes wheel-down as 65 + 'M'", () => {
    expect(
      encodeSgrMouse(
        {
          type: "scroll",
          button: 0,
          modifiers: noMods,
          scroll: { direction: "down", delta: 1 },
        },
        5,
        5,
      ),
    ).toBe("\x1B[<65;6;6M");
  });

  it("ORs in modifier bits (shift=4, alt=8, ctrl=16)", () => {
    expect(
      encodeSgrMouse(
        {
          type: "down",
          button: 2,
          modifiers: { shift: true, alt: false, ctrl: true },
        },
        0,
        0,
      ),
    ).toBe(`\x1B[<${2 | 4 | 16};1;1M`);
  });

  it("returns null for unhandled events", () => {
    expect(
      encodeSgrMouse(
        { type: "move", button: 0, modifiers: noMods },
        0,
        0,
      ),
    ).toBeNull();
  });
});
