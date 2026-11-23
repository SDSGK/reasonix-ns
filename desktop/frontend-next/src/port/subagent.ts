import type { HistoryMessage } from "./session";

/** running is a run this window's kernel is executing now; interrupted is one
 *  whose owner is gone without a result. */
export type SubagentState = "running" | "completed" | "failed" | "cancelled" | "interrupted";

/** One sub-agent run a conversation spawned: GET /subagents. */
export interface SubagentRun {
  ref: string;
  name: string;
  kind: string;
  model: string;
  effort?: string;
  /** Where the run stands. Only a running one may be talked to: a run that
   *  has ended is closed, and the kernel refuses a message to it
   *  (subagent.not_running). */
  state: SubagentState;
  /** The transcript tool call that spawned the run. */
  parentCall?: string;
  startedAt: number;
  updatedAt: number;
  /** What the run's own conversation weighed, estimated by the kernel from
   *  the transcript it kept. It is an estimate and not a bill, but it is the
   *  same measure for every run, so two sub-agents can be compared. Absent
   *  means the kernel did not count it. */
  tokens?: number;
}

/** One page of a run's conversation: GET /subagents/{ref}/transcript. Rows keep
 *  the run's own indices; next is where the following page starts. */
export interface SubagentTranscript {
  run: SubagentRun;
  messages: HistoryMessage[];
  after: number;
  next: number;
  total: number;
  live: boolean;
}

/** One continued turn of a run: POST /subagents/{ref}/submit. The run keeps its
 *  reference and its transcript, so the answer is read from the same place the
 *  first one was read from. */
export interface SubagentTurn {
  ref: string;
  answer: string;
  read?: string[];
  wrote?: string[];
}
