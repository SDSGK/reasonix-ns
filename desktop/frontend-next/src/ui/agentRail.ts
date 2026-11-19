import { useSyncExternalStore } from "react";

// The delegate rail's summary and its panel: the chrome's badge names the
// session's sub-agents, and the panel itself is drawn by the focused pane,
// which owns the tasks. The window holds both so neither side reaches across.
export interface AgentsRailSummary {
  live: number;
  total: number;
}

let summary: AgentsRailSummary | null = null;
let deckOpen = false;
const listeners = new Set<() => void>();

const publish = () => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** setAgentsRail reports what the focused pane's delegate rail holds. */
export function setAgentsRail(next: AgentsRailSummary | null): void {
  summary = next;
  publish();
}

/** useAgentsRail reads the rail's summary, for the chrome's badge. */
export function useAgentsRail(): AgentsRailSummary | null {
  return useSyncExternalStore(subscribe, () => summary, () => summary);
}

/** setAgentDeckOpen opens or closes the delegate panel. */
export function setAgentDeckOpen(open: boolean): void {
  deckOpen = open;
  publish();
}

/** toggleAgentDeck opens the delegate panel, or closes it if it is open. */
export function toggleAgentDeck(): void {
  deckOpen = !deckOpen;
  publish();
}

/** useAgentDeckOpen reads whether the delegate panel is open. */
export function useAgentDeckOpen(): boolean {
  return useSyncExternalStore(subscribe, () => deckOpen, () => deckOpen);
}
