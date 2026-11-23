import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { AgentPort } from "../port/port";
import type { SubagentRun } from "../port/subagent";
import type { AgentRequest, AgentTab } from "./useAgentTabs";
import { setSubagentRuns, useSubagentRunsWatched } from "./agentRail";

// How often the kernel is asked for the runs while something is watching
// them. A second is the resolution a reader acts on: long enough that the
// read is not a cost, short enough that a run which just ended says so.
const RUN_POLL_MS = 1000;

/** Opening a task card's sub-agents in the workbench. The kernel's list pairs a
 *  run with the tool call that spawned it, so the card names its runs exactly.
 *  False means this call has no run to read — an older session, or a kernel
 *  without the route — and the caller keeps its own view. */
export function useAgentRequest(port: AgentPort, reveal: () => void, active = true) {
  const [request, setRequest] = useState<AgentRequest>();
  const watched = useSubagentRunsWatched();
  useEffect(() => () => setRequest(undefined), [port]);

  // The runs are read while something is waiting for them: the deck, or a tab
  // that shows one. The window holds what the kernel said, so the deck and
  // the tabs read the same list.
  //
  // Only the pane on screen asks: the window holds one list of runs, and a
  // pane in the background would answer it with another session's.
  useEffect(() => {
    if (!active || !watched) return;
    let alive = true;
    const read = async () => {
      const list = await readRuns(port);
      if (alive && list) setSubagentRuns(list);
    };
    void read();
    const id = setInterval(() => { void read(); }, RUN_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [port, watched, active]);

  const open = useCallback(async (call: string): Promise<boolean> => {
    const list = await readRuns(port);
    if (!list) return false;
    setSubagentRuns(list);
    const runs = list.filter((run) => run.parentCall === call);
    if (runs.length === 0) return false;
    setRequest(requestOf(runs, setRequest));
    reveal();
    return true;
  }, [port, reveal]);

  // One run on its own: the deck names the sub-agent a reader picked, and
  // that is the one whose transcript they asked for.
  const openRef = useCallback(async (ref: string): Promise<boolean> => {
    const list = await readRuns(port);
    if (!list) return false;
    setSubagentRuns(list);
    const run = list.find((r) => r.ref === ref);
    if (!run) return false;
    setRequest(requestOf([run], setRequest));
    reveal();
    return true;
  }, [port, reveal]);

  const openJob = useCallback((job: { id: string; name: string }) => {
    const req: AgentRequest = { jobs: [job], consumed: () => setRequest((now) => (now === req ? undefined : now)) };
    setRequest(req);
    reveal();
  }, [reveal]);
  return { request, open, openRef, openJob };
}

/** readRuns asks the kernel for the runs, and says nothing when it cannot
 *  answer: a kernel without the route leaves the reader with what it had. */
async function readRuns(port: AgentPort): Promise<SubagentRun[] | null> {
  try {
    return await port.subagents();
  } catch {
    return null;
  }
}

/** requestOf is the workbench's opening of a set of runs: each one keeps its
 *  own name and where it stands, so a tab can say so without asking again.
 *  The request clears itself once the workbench has taken it. */
function requestOf(
  runs: SubagentRun[],
  setRequest: Dispatch<SetStateAction<AgentRequest | undefined>>,
): AgentRequest {
  const req: AgentRequest = {
    runs: runs.map(tabOf),
    consumed: () => setRequest((now) => (now === req ? undefined : now)),
  };
  return req;
}

/** tabOf is what a run looks like as a tab: its name, and where it stands. */
function tabOf(run: SubagentRun): AgentTab {
  return { ref: run.ref, name: run.name, state: run.state };
}
