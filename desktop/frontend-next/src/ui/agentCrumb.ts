import { useEffect, useRef, useSyncExternalStore } from "react";
import { keyOf, type Surface } from "./workbench_tabs";

// Where the reader is inside a sub-agent's own conversation. The pane showing
// it owns the name; the window chrome reads it, and asks to be taken back out
// when the reader presses the way back.
export interface AgentCrumb {
  ref: string;
  name: string;
}

/** The pane the breadcrumb sits in: the surfaces it holds, and how it moves
 *  between them. */
export interface CrumbPane {
  /** Closes the given surfaces. */
  close: (targets: Surface[]) => void;
  /** Every surface the pane holds, in strip order. */
  surfaces: Surface[];
  /** Shows the surface with this key. */
  select: (key: string) => void;
}

let crumb: AgentCrumb | null = null;
let leaving: { ref: string; n: number } | null = null;
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

/** setAgentCrumb names the sub-agent a pane is showing. */
export function setAgentCrumb(next: AgentCrumb): void {
  crumb = next;
  publish();
}

/** clearAgentCrumb gives the name up, but only for the pane that holds it: a
 *  pane that stopped showing one must not unname another pane's. */
export function clearAgentCrumb(ref: string): void {
  if (crumb?.ref !== ref) return;
  crumb = null;
  publish();
}

/** requestLeaveAgent asks for the named sub-agent's view to be left. */
export function requestLeaveAgent(ref: string): void {
  leaving = { ref, n: (leaving?.n ?? 0) + 1 };
  publish();
}

/** useAgentCrumb reads the sub-agent the reader is inside. */
export function useAgentCrumb(): AgentCrumb | null {
  return useSyncExternalStore(subscribe, () => crumb, () => crumb);
}

/** useLeaveAgentRequest reads the requests to leave a sub-agent's view. */
export function useLeaveAgentRequest(): { ref: string; n: number } | null {
  return useSyncExternalStore(subscribe, () => leaving, () => leaving);
}

/** useAgentCrumbSurface keeps the chrome's breadcrumb in step with the tab
 *  this surface shows, and takes the reader back out when they ask. */
export function useAgentCrumbSurface(active: Surface | undefined, shown: boolean, pane: CrumbPane): void {
  const ref = active?.kind === "agent" ? active.ref : "";
  const name = active?.kind === "agent" ? active.name : "";
  const closer = useRef(pane.close);
  closer.current = pane.close;
  const picker = useRef(pane.select);
  picker.current = pane.select;
  const held = useRef("");
  const leave = useLeaveAgentRequest();
  const seen = useRef(0);
  useEffect(() => {
    if (shown && ref) {
      held.current = ref;
      setAgentCrumb({ ref, name });
      return;
    }
    // The pane stopped showing a sub-agent: it gives up the name it held, so
    // the breadcrumb follows the reader rather than staying where they left.
    if (held.current) {
      clearAgentCrumb(held.current);
      held.current = "";
    }
  }, [shown, ref, name]);
  useEffect(() => () => {
    if (held.current) clearAgentCrumb(held.current);
  }, []);
  useEffect(() => {
    if (!leave || leave.n === seen.current) return;
    seen.current = leave.n;
    if (!ref || leave.ref !== ref) return;
    const target = active?.kind === "agent" ? active : undefined;
    if (!target) return;
    // The way back closes the sub-agent's tab and puts the reader back on the
    // main conversation: a pane left showing nothing reads as a pane that broke.
    const home = pane.surfaces.find((s) => s.kind === "manual");
    closer.current([target]);
    if (home) picker.current(keyOf(home));
  }, [leave, ref, active, pane.surfaces]);
}
