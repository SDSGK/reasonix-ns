import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { elapsed, tokens } from "../i18n/format";
import { argOf } from "./args";
import { delegateStateLabel, delegateStatus, delegateStatusLabel, type DelegateStatus } from "./delegation";
import { agentsIn } from "./panels/derive";
import type { Task } from "./panels/Agents";
import { AgentAvatar, nameOf } from "./cards/SubagentGroup";
import { useWatched } from "./Cost";
import { RMark } from "./RMark";
import { StudioIcon } from "./StudioIcon";
import { agentRailBadge, deckSpot, focusAgentRailBadge, setAgentDeckOpen, useSubagentRuns, watchSubagentRuns } from "./agentRail";
import { useEscape } from "./dismiss";
import { pinToViewport, useFollow } from "./place";
import type { SubagentRun, SubagentState } from "../port/subagent";

// How far the deck hangs below the badge that opened it.
const GAP = 8;

/** The session's delegates as the run rail's reading opens them: who, sent to
 *  do what, and where each stands; a row opens that run.
 *
 *  A row is a batch — one dispatch, which may have opened several
 *  sub-agents — and under it stand the sub-agents themselves: which one is
 *  which, whether it is still working, how long it has been at it and what it
 *  weighed. The batch row opens the whole group; a sub-agent's own row opens
 *  that one run. */
export function AgentDeck({ tasks, runs, onOpen, onOpenRun, onStop }: {
  tasks: Task[];
  runs?: SubagentRun[];
  onOpen: (taskId: string) => void;
  onOpenRun?: (ref: string) => void;
  onStop?: (callId: string) => void;
}) {
  const live = tasks.filter((x) => x.running);
  const list = runs ?? [];
  // The kernel's list names the runs exactly; the transcript only says how
  // many a dispatch declared. The list wins once it is there.
  const known = list.length > 0;
  const counted = known
    ? { live: list.filter((x) => x.state === "running").length, total: list.length }
    : { live: agentsIn(live), total: agentsIn(tasks) };
  const claimed = new Set<string>();
  return (
    <div className="agent-deck">
      <header className="agent-deck-head">
        <b>{t("subagent.deck.title")}</b>
        <span>{t("subagent.deck.count", { live: counted.live, total: counted.total })}</span>
      </header>
      {tasks.map((x) => {
        const mine = runsOf(x, list, claimed);
        return (
          <div key={x.id}>
            <DeckRow task={x} status={delegateStatus(x.running, x.tool)} onOpen={onOpen} />
            {mine.map((run) => <RunRow key={run.ref} run={run} onOpen={onOpenRun} />)}
          </div>
        );
      })}
      {loose(list, claimed).map((run) => <RunRow key={run.ref} run={run} onOpen={onOpenRun} />)}
      <footer className="agent-deck-foot">
        <span>{t("subagent.deck.hint")}</span>
        {live.length > 0 && onStop && (
          <button type="button" className="agent-quiet" data-action="agent.stop-all" onClick={() => live.forEach((x) => x.tool.id && onStop(x.tool.id))}>{t("common.stop_all")}</button>
        )}
      </footer>
    </div>
  );
}

/** The deck's own layer: the panel that opens under the chrome's badge, with
 *  the scrim behind it that closes the deck on a press away.
 *
 *  The scrim covers the window and holds no layout of its own — it is there
 *  to catch the press that dismisses the deck. The panel is pinned to the
 *  badge by script, so it reads as the badge's own rather than as a corner
 *  of the window, and it follows the badge when the page scrolls or the
 *  window changes shape. */
export function AgentDeckLayer({ tasks, onOpen, onOpenRun, onStop }: {
  tasks: Task[];
  onOpen: (taskId: string) => void;
  onOpenRun?: (ref: string) => void;
  onStop?: (callId: string) => void;
}) {
  const float = useRef<HTMLDivElement>(null);
  const badge = useRef<HTMLElement | null>(null);
  // The runs the kernel named: which sub-agent is which, and where each one
  // stands. The deck asks for them again as long as it is open.
  const runs = useSubagentRuns();

  const place = useCallback(() => {
    const el = float.current;
    if (!el) return;
    const mark = agentRailBadge();
    badge.current = mark;
    const box = el.getBoundingClientRect();
    if (!mark) {
      // No badge on screen — the chrome is not drawn, or the session it named
      // has ended. The deck then sits in the corner the badge occupies, which
      // is the only place it can still be read as belonging to the window.
      pinToViewport(el, innerWidth - 16 - box.width, 56);
    } else {
      const to = mark.getBoundingClientRect();
      const spot = deckSpot(to, { width: box.width, height: box.height }, { width: innerWidth, height: innerHeight }, GAP);
      pinToViewport(el, spot.x, spot.y);
    }
    // Written after the pin, so the panel is never seen at the wrong corner
    // for a frame between the mount and the measurement.
    el.dataset.placed = "";
  }, []);

  useFollow(true, place, tasks.length, { anchor: badge, container: float });
  useEscape(true, () => setAgentDeckOpen(false));

  // While the deck is open the kernel is asked for the runs again and again:
  // a run that ends while the deck is open says so here.
  useEffect(() => watchSubagentRuns(), []);

  // The deck takes the focus when it opens, so the keyboard reaches its rows
  // without hunting for them, and gives it back to the badge when it closes —
  // unless the person has already moved the focus somewhere else.
  useLayoutEffect(() => {
    const el = float.current;
    el?.querySelector<HTMLElement>(".agent-deck-row")?.focus();
    return () => {
      const active = document.activeElement;
      if (!active || active === document.body || el?.contains(active)) focusAgentRailBadge();
    };
  }, []);

  return (
    <div
      className="agentrail-scrim"
      data-action="agentrail.dismiss"
      onClick={(e) => { if (e.target === e.currentTarget) setAgentDeckOpen(false); }}
    >
      <div className="agentrail-float" ref={float}>
        <AgentDeck
          tasks={tasks}
          runs={runs}
          onOpen={(taskId) => { setAgentDeckOpen(false); onOpen(taskId); }}
          onOpenRun={(ref) => { setAgentDeckOpen(false); onOpenRun?.(ref); }}
          onStop={onStop}
        />
      </div>
    </div>
  );
}

function DeckRow({ task, status, onOpen }: { task: Task; status: DelegateStatus; onOpen: (taskId: string) => void }) {
  const watched = useWatched(status === "running");
  const raw = nameOf(task);
  // Older journals name the dispatch plainly ("task"); the prompt it carried
  // is the readable title a person recognises.
  const prompt = raw === "task" ? argOf(task.tool.args, "prompt", "task", "description") : "";
  const name = !raw || raw === "task" ? (prompt ? prompt.slice(0, 32) : raw) : raw;
  const took = task.tool.durationMs ? elapsed(task.tool.durationMs) : "";
  const tok = task.tool.contextTokens;
  const reading = status === "running"
    ? [t("subagent.step", { n: Math.max(task.children.length, 1) }), watched ? elapsed(watched) : ""]
    : [delegateStatusLabel(status), tok != null ? `${tokens(tok)} tok` : "", took];
  return (
    <button type="button" className="ag agent-deck-row" data-status={status} data-action="agent.open" data-target={task.id}
      aria-label={t("subagent.deck.open_full", { name })} title={status === "failed" ? task.tool.err : undefined} onClick={() => onOpen(task.id)}>
      <AgentAvatar name={name} />
      <span className="agent-deck-who">
        <b>{name}</b>
        {task.tool.profile?.label && <span>{task.tool.profile.label}</span>}
      </span>
      <span className="agent-deck-state">
        {status === "running" && <RMark className="plan-spin" />}
        {tok != null && status !== "running" && <span className="agent-deck-tok">{tokens(tok)} tok</span>}
        {reading.filter(Boolean).join(" · ")}
      </span>
      <StudioIcon name="chevron" className="agent-deck-go" />
    </button>
  );
}

/** RunRow is one sub-agent: which one it is, whether it is still working, how
 *  long it has been at it, and what it weighed. A running one counts the
 *  seconds as they pass; a finished one keeps the time it took. */
function RunRow({ run, onOpen }: { run: SubagentRun; onOpen?: (ref: string) => void }) {
  const running = run.state === "running";
  const now = useNow(running);
  const took = running ? Math.max(0, now - run.startedAt) : Math.max(0, run.updatedAt - run.startedAt);
  const tok = run.tokens;
  const reading = [delegateStateLabel(run.state), took > 0 ? elapsed(took) : ""].filter(Boolean);
  return (
    <button type="button" className="ag agent-deck-row" data-status={runStatus(run.state)} data-action="agent.open" data-target={run.ref}
      aria-label={t("subagent.deck.open_full", { name: run.name })} onClick={() => onOpen?.(run.ref)}
      style={{ paddingLeft: 22 }}>
      <AgentAvatar name={run.name} />
      <span className="agent-deck-who">
        <b>{run.name}</b>
        {run.model && <span>{run.model}</span>}
      </span>
      <span className="agent-deck-state">
        {running && <RMark className="plan-spin" />}
        {tok != null && tok > 0 && <span className="agent-deck-tok">{tokens(tok)} tok</span>}
        {reading.join(" · ")}
      </span>
      <StudioIcon name="chevron" className="agent-deck-go" />
    </button>
  );
}

/** runsOf are the sub-agents a dispatch opened: the runs whose parent call is
 *  that dispatch. The claim is recorded so a run is never listed twice. */
function runsOf(task: Task, runs: SubagentRun[], claimed: Set<string>): SubagentRun[] {
  const call = task.tool.id;
  if (!call) return [];
  const mine = runs.filter((run) => run.parentCall === call && !claimed.has(run.ref));
  for (const run of mine) claimed.add(run.ref);
  return mine;
}

/** loose are the runs no dispatch in this transcript claims: the deck still
 *  names them, because a sub-agent that ran is a sub-agent the reader can
 *  open. */
function loose(runs: SubagentRun[], claimed: Set<string>): SubagentRun[] {
  return runs.filter((run) => !claimed.has(run.ref));
}

/** runStatus is how a run's state reads on a row: the deck colours a row by
 *  the same words the rest of the interface uses. */
function runStatus(state: SubagentState): DelegateStatus {
  if (state === "running") return "running";
  if (state === "completed") return "done";
  if (state === "failed") return "failed";
  return "refused";
}

/** useNow is the window's own clock, read again while a run is working: a
 *  run that is still going says how long it has been at it. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  return now || Date.now();
}
