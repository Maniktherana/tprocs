import { describe, expect, it } from "bun:test";
import { Effect, Exit, Layer, Scope } from "effect";
import { TerminalEngineLive } from "../src/services/terminal-engine";
import { TerminalState, TerminalStateLive } from "../src/services/terminal-state";

const TerminalStateProvided = TerminalStateLive.pipe(
  Layer.provide(TerminalEngineLive),
);

describe("TerminalState", () => {
  it("attaches a terminal per proc and exposes it via get/entries", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const svc = yield* TerminalState;
          const a = yield* svc.attach("proc-a", { cols: 80, rows: 24 });
          const b = yield* svc.attach("proc-b", { cols: 40, rows: 12 });
          a.feed("hello");
          b.feed("hi");
          expect(a.cell(0, 0).char).toBe("h".codePointAt(0)!);
          expect(b.cell(0, 0).char).toBe("h".codePointAt(0)!);
          expect(svc.get("proc-a")).toBe(a);
          expect(svc.get("proc-b")).toBe(b);
          expect(svc.entries().length).toBe(2);
        }).pipe(Effect.provide(TerminalStateProvided)),
      ),
    ));

  it("detaches a terminal when its acquisition scope closes", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const svc = yield* TerminalState;
          const inner = yield* Scope.make();
          const term = yield* svc
            .attach("p", { cols: 80, rows: 24 })
            .pipe(Scope.extend(inner));
          expect(svc.get("p")).toBe(term);
          yield* Scope.close(inner, Exit.void);
          expect(svc.get("p")).toBeUndefined();
        }).pipe(Effect.provide(TerminalStateProvided)),
      ),
    ));
});
