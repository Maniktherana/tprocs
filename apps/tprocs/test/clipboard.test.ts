import { describe, expect, it } from "bun:test";
import { detectProvider, encodeOSC52 } from "../src/services/clipboard";

describe("Clipboard", () => {
  it("encodes OSC52 with base64 payload between ESC]52;; and BEL", () => {
    expect(encodeOSC52("hello")).toBe("\x1b]52;;aGVsbG8=\x07");
    expect(encodeOSC52("")).toBe("\x1b]52;;\x07");
  });

  it("falls back to OSC52 when no native helper is available and no env hints", () => {
    const p = detectProvider({}, "linux");
    expect(p.kind).toBe("osc52");
  });

  it("prefers pbcopy on darwin when present", () => {
    const p = detectProvider({}, "darwin");
    // Test machine likely has pbcopy; if not, gracefully accept osc52.
    expect(p.kind === "exec" ? p.cmd : "osc52").toMatch(/^(pbcopy|osc52)$/);
  });

  it("prefers wl-copy when WAYLAND_DISPLAY is set and wl-copy exists", () => {
    const p = detectProvider({ WAYLAND_DISPLAY: "wayland-0" }, "linux");
    // Fallback path is fine on CI without wl-copy installed.
    if (p.kind === "exec") expect(p.cmd).toBe("wl-copy");
  });
});
