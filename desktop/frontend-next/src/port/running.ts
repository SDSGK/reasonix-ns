import type { ProcessEntry } from "./process";
import type { SubagentRun, SubagentTranscript, SubagentTurn } from "./subagent";

/** What this conversation has handed off or has running. */
export interface RunningWorkPort {
  // The sub-agent runs this conversation spawned, running or finished, newest
  // first, and one run's conversation a page at a time: a running run is read
  // live. A run of another conversation is refused (subagent.not_owned). Each
  // run says where it stands, how long it has been at it and what its own
  // conversation weighed, so a reader need not open it to learn that.
  subagents(): Promise<SubagentRun[]>;
  subagentTranscript(ref: string, after?: number, limit?: number): Promise<SubagentTranscript>;
  // One more turn of a run: the same transcript, continued. Only a run that is
  // still working may be talked to — one that has ended is refused
  // (subagent.not_running) — and the session must be idle for it
  // (subagent.busy). The answer is read back from the run's own transcript,
  // not from here.
  subagentContinue(ref: string, input: string): Promise<SubagentTurn>;
  // What this session has running now across owners, read when asked and never
  // pushed: a window that does not open the list pays nothing for it.
  processes(): Promise<ProcessEntry[]>;
}
