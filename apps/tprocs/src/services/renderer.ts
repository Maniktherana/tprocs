import { createCliRenderer, type CliRenderer } from "@opentui/core";
import { Context, Effect, Layer } from "effect";

export type RendererShape = { readonly renderer: CliRenderer };

export class Renderer extends Context.Tag("Renderer")<Renderer, RendererShape>() {}

// Scoped resource: `createCliRenderer()` flips the host terminal into
// alt-screen + mouse-tracking + raw mode. `renderer.destroy()` reverses ALL of
// that. Wiring it as a Layer.scoped finaliser means `runtime.dispose()` always
// restores the terminal — whether triggered by a signal, the quit command, or
// a crash handler.
export const RendererLive = Layer.scoped(
  Renderer,
  Effect.gen(function* () {
    const renderer = yield* Effect.promise(() => createCliRenderer());
    yield* Effect.addFinalizer(() => Effect.sync(() => renderer.destroy()));
    return { renderer };
  }),
);
