import type { ProcessEntry } from "./process";
import type { SubagentRun, SubagentTranscript, SubagentTurn } from "./subagent";

/** What this conversation has handed off or has running. */
export interface RunningWorkPort {
  // The sub-agent runs this conversation spawned, running or finished, newest
  // first, and one run's conversation a page at a time: a running run is read
  // live. A run of another conversation is refused (subagent.not_owned).
  subagents(): Promise<SubagentRun[]>;
  subagentTranscript(ref: string, after?: number, limit?: number): Promise<SubagentTranscript>;
  // One more turn of a run: the same transcript, continued. The session must
  // be idle for it (subagent.busy), and the answer is read back from the run's
  // own transcript, not from here.
  subagentContinue(ref: string, input: string): Promise<SubagentTurn>;
  // What this session has running now across owners, read when asked and never
  // pushed: a window that does not open the list pays nothing for it.
  processes(): Promise<ProcessEntry[]>;
}
