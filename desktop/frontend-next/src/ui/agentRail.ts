import { useSyncExternalStore } from "react";
import type { SubagentRun } from "../port/subagent";

// The delegate rail's summary and its panel: the chrome's badge names the
// session's sub-agents, and the panel itself is drawn by the focused pane,
// which owns the tasks. The window holds both so neither side reaches across.
export interface AgentsRailSummary {
  live: number;
  total: number;
}

let summary: AgentsRailSummary | null = null;
let deckOpen = false;
// The runs the kernel last named: which sub-agent is which, where it stands,
// how long it has been at it and what it weighed. The deck reads them to say
// which one is which; the workbench's tabs read them to say whether a run is
// still working. Both live here because they are the same list.
let runs: SubagentRun[] = [];
// How many places are waiting for that list. Nothing reads the kernel's runs
// until something does, and a window that shows neither the deck nor a
// sub-agent's tab pays nothing for the read.
let watchers = 0;
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

/** setSubagentRuns publishes the runs the kernel last named. A list that says
 *  the same as the one before it is not published again: the deck and the
 *  tabs redraw on every publish, and a poll that found nothing new should
 *  leave them alone. */
export function setSubagentRuns(next: SubagentRun[]): void {
  if (sameRuns(runs, next)) return;
  runs = next;
  publish();
}

/** useSubagentRuns reads the runs the window last saw. */
export function useSubagentRuns(): SubagentRun[] {
  return useSyncExternalStore(subscribe, () => runs, () => runs);
}

/** watchSubagentRuns says that something is waiting for the runs, so the
 *  kernel is asked for them again and again. It returns the release: the
 *  read stops when the last watcher is gone. */
export function watchSubagentRuns(): () => void {
  watchers++;
  publish();
  return () => {
    watchers = Math.max(0, watchers - 1);
    publish();
  };
}

/** useSubagentRunsWatched tells whether anything is waiting for the runs. */
export function useSubagentRunsWatched(): boolean {
  return useSyncExternalStore(subscribe, () => watchers > 0, () => watchers > 0);
}

/** sameRuns is whether two lists say the same thing: the same runs, in the
 *  same state, with the same weight. */
function sameRuns(a: SubagentRun[], b: SubagentRun[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((run, i) => {
    const other = b[i];
    return (
      run.ref === other.ref &&
      run.name === other.name &&
      run.state === other.state &&
      run.updatedAt === other.updatedAt &&
      run.tokens === other.tokens &&
      run.parentCall === other.parentCall
    );
  });
}

// The badge in the window chrome is what the deck opens from, so the deck
// reads where the badge is rather than guessing a corner of the window. The
// chrome owns the badge; this only finds it, and finds it again whenever the
// chrome re-draws it.

/** agentRailBadge is the badge the deck hangs from, or null when the chrome
 *  is not on screen. */
export function agentRailBadge(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".agentrail-badge");
}

/** focusAgentRailBadge hands the focus back to the badge that opened the
 *  deck, so closing it leaves the keyboard where it started. */
export function focusAgentRailBadge(): void {
  agentRailBadge()?.focus();
}

/** A rectangle on screen, and the box that has to fit beside it. */
export interface DeckAnchor {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface DeckBox {
  width: number;
  height: number;
}

/** deckSpot is where the deck's top-left goes for a badge at `anchor`: under
 *  the badge, flush with the badge's own edge — its right edge when the badge
 *  sits on the right of the window, its left edge otherwise — and above it
 *  only when the window has no room below. The numbers are on-screen ones;
 *  the caller writes them back through place.ts, which divides out the zoom. */
export function deckSpot(
  anchor: DeckAnchor,
  box: DeckBox,
  viewport: { width: number; height: number },
  gap = 8,
): { x: number; y: number } {
  const middle = anchor.left + (anchor.right - anchor.left) / 2;
  const x = middle > viewport.width / 2 ? anchor.right - box.width : anchor.left;
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - box.height;
  const y = below + box.height <= viewport.height - 6 || above < 6 ? below : above;
  return { x, y };
}
