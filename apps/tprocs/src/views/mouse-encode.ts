import type { MouseEvent } from "@opentui/core";

const MOTION = 32;
const SHIFT = 4;
const ALT = 8;
const CTRL = 16;
const WHEEL_UP = 64;
const WHEEL_DOWN = 65;

const modifierBits = (m: MouseEvent["modifiers"]): number =>
  (m.shift ? SHIFT : 0) | (m.alt ? ALT : 0) | (m.ctrl ? CTRL : 0);

// SGR 1006: `ESC [ < Cb ; Cx ; Cy M/m`. Coords are 1-based on the wire.
// `null` means "nothing to send" (move without drag, over/out, etc).
export const encodeSgrMouse = (
  ev: Pick<MouseEvent, "type" | "button" | "modifiers" | "scroll">,
  row: number,
  col: number,
): string | null => {
  const x = col + 1;
  const y = row + 1;
  const mods = modifierBits(ev.modifiers);

  if (ev.type === "scroll") {
    const dir = ev.scroll?.direction;
    if (dir !== "up" && dir !== "down") return null;
    const cb = (dir === "up" ? WHEEL_UP : WHEEL_DOWN) | mods;
    return `\x1B[<${cb};${x};${y}M`;
  }

  if (ev.type === "down") {
    const cb = (ev.button & 3) | mods;
    return `\x1B[<${cb};${x};${y}M`;
  }

  if (ev.type === "up" || ev.type === "drag-end" || ev.type === "drop") {
    const cb = (ev.button & 3) | mods;
    return `\x1B[<${cb};${x};${y}m`;
  }

  if (ev.type === "drag") {
    const cb = ((ev.button & 3) | MOTION | mods) & 0xff;
    return `\x1B[<${cb};${x};${y}M`;
  }

  return null;
};
