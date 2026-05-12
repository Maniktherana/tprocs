import { createContext, useContext, useSyncExternalStore } from "react";
import type { ClipboardShape } from "../services/clipboard";
import type { InputRouterShape } from "../services/input-router";
import type { PaneShape } from "../services/pane";
import type { ProcessManagerShape } from "../services/process-manager";
import type { RendererBridgeShape } from "../services/renderer-bridge";

export type Services = {
  readonly pm: ProcessManagerShape;
  readonly pane: PaneShape;
  readonly bridge: RendererBridgeShape;
  readonly input: InputRouterShape;
  readonly clipboard: ClipboardShape;
};

const ServicesCtx = createContext<Services | null>(null);

export const ServicesProvider = ServicesCtx.Provider;

export const useServices = (): Services => {
  const s = useContext(ServicesCtx);
  if (!s) throw new Error("ServicesProvider missing in the tree");
  return s;
};

export const useRenderTick = (): number => {
  const { bridge } = useServices();
  return useSyncExternalStore(bridge.subscribe, bridge.getTick, bridge.getTick);
};
