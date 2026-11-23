import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { keyOf, type Surface } from "./workbench_tabs";
import { useSubagentRuns, watchSubagentRuns } from "./agentRail";
import type { SubagentState } from "../port/subagent";

export interface AgentTab { ref: string; name: string; state?: SubagentState }
export interface JobTab { id: string; name: string }
export type RunTab = Extract<Surface, { kind: "agent" | "job" }>;
/** Runs to open: sub-agent runs, or one background job's output. */
export interface AgentRequest { runs?: AgentTab[]; jobs?: JobTab[]; consumed?: () => void }

/** The sub-agent runs and background jobs open as workbench tabs. A request
 *  opens each once and selects the first; the workbench reports it taken so a
 *  re-render never replays it. */
export function useAgentTabs(request: AgentRequest | undefined, pick: (key: string) => void, setDismissed: Dispatch<SetStateAction<Set<string>>>) {
  const [agents, setAgents] = useState<RunTab[]>([]);
  const runs = useSubagentRuns();

  // A tab says where its run stands, and that changes while the tab is open:
  // the kernel's record is the truth, and it is read again as it changes.
  useEffect(() => {
    setAgents((now) => {
      let changed = false;
      const next = now.map((tab) => {
        if (tab.kind !== "agent") return tab;
        const live = runs.find((run) => run.ref === tab.ref);
        if (!live || live.state === tab.state) return tab;
        changed = true;
        return { ...tab, state: live.state };
      });
      return changed ? next : now;
    });
  }, [runs]);

  // While a run's tab is open the kernel is asked for the runs again and
  // again: that is where the tab's state comes from.
  const open = agents.filter((tab) => tab.kind === "agent").length;
  useEffect(() => {
    if (!open) return;
    return watchSubagentRuns();
  }, [open]);

  useEffect(() => {
    const asked: RunTab[] = [
      ...(request?.runs ?? []).map((run) => ({ kind: "agent" as const, ...run })),
      ...(request?.jobs ?? []).map((job) => ({ kind: "job" as const, ...job })),
    ];
    if (!request || asked.length === 0) return;
    setAgents((now) => {
      const fresh = asked.filter((tab) => !now.some((open) => keyOf(open) === keyOf(tab)));
      return fresh.length ? [...now, ...fresh] : now;
    });
    setDismissed((now) => {
      const next = new Set(now);
      for (const tab of asked) next.delete(keyOf(tab));
      return next;
    });
    pick(keyOf(asked[0]));
    request.consumed?.();
  }, [request, pick, setDismissed]);
  return { agents, setAgents };
}
