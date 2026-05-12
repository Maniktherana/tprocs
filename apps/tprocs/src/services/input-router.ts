import type { KeyEvent } from "@opentui/core";
import { Context, Effect, Layer } from "effect";
import type { AppCommand } from "../commands";
import { resolveKey } from "../keymap";
import { PaneService } from "./pane";
import { ProcessManager } from "./process-manager";

export type InputRouterShape = {
  readonly handleKey: (event: KeyEvent) => Effect.Effect<void>;
  readonly execute: (command: AppCommand) => Effect.Effect<void>;
};

export class InputRouter extends Context.Tag("InputRouter")<
  InputRouter,
  InputRouterShape
>() {}

const QUIT_GRACE_MS = 300;

export const InputRouterLive = Layer.effect(
  InputRouter,
  Effect.gen(function* () {
    const pm = yield* ProcessManager;
    const pane = yield* PaneService;

    const onCurrent = (op: (id: string) => Effect.Effect<void>) =>
      Effect.gen(function* () {
        const id = pm.currentId();
        if (id) yield* op(id);
      });

    const quit = (force: boolean): Effect.Effect<void> =>
      Effect.gen(function* () {
        const ids = pm.procs().map((p) => p.id);
        yield* Effect.forEach(
          ids,
          (id) => (force ? pm.kill(id) : pm.stop(id)),
          { concurrency: "unbounded" },
        );
        if (!force) yield* Effect.sleep(`${QUIT_GRACE_MS} millis`);
        yield* Effect.sync(() => process.exit(0));
      });

    const execute = (cmd: AppCommand): Effect.Effect<void> => {
      switch (cmd.kind) {
        case "quit":
          return quit(false);
        case "force-quit":
          return quit(true);
        case "toggle-focus":
          return Effect.sync(() => pane.toggleFocus());
        case "focus-procs":
          return Effect.sync(() => pane.setFocus("procs"));
        case "focus-output":
          return Effect.sync(() => pane.setFocus("output-interactive"));
        case "enter-interactive":
          return Effect.sync(() => pane.setFocus("output-interactive"));
        case "exit-interactive":
          return Effect.sync(() => pane.setFocus("procs"));
        case "next-proc":
          return Effect.sync(() => pm.selectNext());
        case "prev-proc":
          return Effect.sync(() => pm.selectPrev());
        case "select-proc-index":
          return Effect.sync(() => pm.selectIndex(cmd.index));
        case "start-current":
          return onCurrent(pm.start);
        case "stop-current":
          return onCurrent(pm.stop);
        case "kill-current":
          return onCurrent(pm.kill);
        case "restart-current":
          return onCurrent(pm.restart);
        case "force-restart-current":
          return onCurrent(pm.forceRestart);
        case "pause-current":
          return onCurrent(pm.pause);
        case "resume-current":
          return onCurrent(pm.resume);
        case "toggle-zoom":
          return Effect.sync(() => pane.toggleZoom());
        case "toggle-keymap":
          return Effect.sync(() => pane.toggleKeymap());
        case "open-menu":
          return Effect.sync(() => pane.setFocus("menu"));
        case "close-menu":
          return Effect.sync(() => pane.setFocus("procs"));
        case "scroll-up-lines":
          return Effect.sync(() => {
            const id = pm.currentId();
            if (id) pm.scrollUp(id, cmd.lines);
          });
        case "scroll-down-lines":
          return Effect.sync(() => {
            const id = pm.currentId();
            if (id) pm.scrollDown(id, cmd.lines);
          });
        case "scroll-up-half":
          return Effect.sync(() => {
            const id = pm.currentId();
            if (id) pm.scrollUp(id, Math.max(1, Math.floor(pane.outputSize().rows / 2)));
          });
        case "scroll-down-half":
          return Effect.sync(() => {
            const id = pm.currentId();
            if (id) pm.scrollDown(id, Math.max(1, Math.floor(pane.outputSize().rows / 2)));
          });
        case "scroll-to-tail":
          return Effect.sync(() => {
            const id = pm.currentId();
            if (id) pm.scrollToTail(id);
          });
      }
    };

    const handleKey = (event: KeyEvent): Effect.Effect<void> =>
      Effect.gen(function* () {
        if (event.eventType !== "press" && event.eventType !== "repeat") return;
        const scope = pane.focus();
        const cmd = resolveKey(scope, event);
        if (cmd) return yield* execute(cmd);

        if (scope === "output-interactive") {
          const id = pm.currentId();
          if (id && event.sequence) yield* pm.write(id, event.sequence);
        }
      });

    return { handleKey, execute };
  }),
);
