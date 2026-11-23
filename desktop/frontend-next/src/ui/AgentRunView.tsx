import { useEffect, useId, useMemo, useRef, useState } from "react";
import { t } from "../i18n";
import { reason } from "../i18n/kernel";
import { fromHistory } from "../state/session";
import type { AgentPort, HistoryMessage } from "../port/port";
import type { SubagentRun } from "../port/subagent";
import { delegateStateLabel } from "./delegation";
import { Transcript } from "./Transcript";
import { AgentAvatar } from "./cards/SubagentGroup";

const POLL_MS = 1500;
const noop = async () => undefined as never;
const none = { entering: [] as string[], onEntered: () => {}, waiting: {}, onExtInvoke: () => {}, checkpoints: new Map(), onOpenProject: () => {}, onKeepHere: () => {}, takeovers: {}, needsProject: false };

/** A sub-agent run read from the kernel's own record, so what it shows does not
 *  depend on what the progress stream happened to carry. A running run is polled
 *  from where the last page ended; a finished one is read once.
 *
 *  The run can also be talked to while it works: a message sent here goes to
 *  the sub-agent itself, which answers in its own transcript. That answer is
 *  read back from where the last page ended — the same place the first answer
 *  came from. A run that has ended cannot be talked to: its round is over, and
 *  the kernel refuses the message (subagent.not_running). */
export function AgentRunView({ port, run, shown, onShowCall }: { port: AgentPort; run: Pick<SubagentRun, "ref" | "name">; shown: boolean; onShowCall?: (callId: string) => void }) {
  const [messages, setMessages] = useState<HistoryMessage[]>([]);
  const [info, setInfo] = useState<SubagentRun>();
  const [failed, setFailed] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState("");
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskLong, setTaskLong] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  // The reader the last read installed, and how far it got: a continuation's
  // answer is read from that point, not from the beginning of the transcript.
  const read = useRef<(after: number) => Promise<void>>(async () => {});
  const reached = useRef(0);
  const taskBox = useRef<HTMLParagraphElement>(null);
  const taskId = useId();

  // The run's first user message is the task the main session handed over; it
  // heads the tab instead of reading as a line of the run.
  const all = useMemo(() => fromHistory(messages).items, [messages]);
  const task = all[0]?.t === "user" ? all[0].text : "";
  const items = task ? all.slice(1) : all;

  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setMessages([]);
    setInfo(undefined);
    setFailed("");
    reached.current = 0;
    const fetch = async (after: number) => {
      try {
        const page = await port.subagentTranscript(run.ref, after);
        if (!current) return;
        setInfo(page.run);
        setFailed("");
        reached.current = page.next;
        if (page.messages.length) setMessages((all) => (after === 0 ? page.messages : [...all, ...page.messages]));
        if (page.next < page.total) await fetch(page.next);
        else if (page.live) timer = setTimeout(() => void fetch(page.next), POLL_MS);
      } catch (e) {
        if (current) setFailed(reason(e));
      }
    };
    read.current = fetch;
    if (shown) void fetch(0);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [port, run.ref, shown]);

  // The task is folded to a few lines, so the fold is measured rather than
  // assumed: only a task that does not fit gets the fade that says there is
  // more below it.
  useEffect(() => {
    const el = taskBox.current;
    if (!el) return;
    const measure = () => setTaskLong(el.scrollHeight > el.clientHeight + 1);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [task]);

  // One more turn of the run. The sub-agent keeps its reference and its
  // transcript, so what it answers is written where the first answer is.
  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendFailed("");
    try {
      await port.subagentContinue(run.ref, text);
      setDraft("");
      await read.current(reached.current);
    } catch (e) {
      setSendFailed(reason(e));
    } finally {
      setSending(false);
    }
  };

  const status = info ? delegateStateLabel(info.state) : "";
  const call = info?.parentCall;
  // Only a run that is still working can be talked to. A run that has ended is
  // closed: the kernel refuses the message, so the box is not offered either.
  const live = info?.state === "running";
  return (
    <div className="agentrun" data-state={info?.state}>
      <div className="agentrun-hd">
        <AgentAvatar name={run.name} />
        <span className="who">{run.name}</span>
        {info?.model && <span className="model">{info.model}</span>}
        {status && <span className="rt">{status}</span>}
        {info?.state === "running" && call && port.stopToolCall ? (
          <button type="button" className="agentrun-stop" data-action="agent.stop" onClick={() => void port.stopToolCall(call).catch(() => {})}>{t("subagent.tab.stop")}</button>
        ) : null}
      </div>
      {task && (
        <div className="agentrun-task" data-expanded={taskOpen} data-long={taskLong}>
          <b>{t("subagent.tab.task")}</b>
          <p id={taskId} ref={taskBox}>{task}</p>
          <button
            type="button"
            className="agentrun-task-more"
            data-action="agent.task-expand"
            aria-expanded={taskOpen}
            aria-controls={taskId}
            onClick={() => setTaskOpen((open) => !open)}
          >
            <span className="agentrun-task-caret" aria-hidden="true" />
            {t(taskOpen ? "subagent.tab.task_collapse" : "subagent.tab.task_expand")}
          </button>
        </div>
      )}
      {failed && <div className="workbench-error" role="alert">{failed}</div>}
      {!failed && !info && <div className="workbench-empty">{t("common.loading")}</div>}
      {info && (
        <Transcript items={items} {...none} scroll={scroll} revision={messages.length} hidden={false} focus={null} onApprove={noop} onFullAccess={noop} onPlan={noop} onAnswer={noop} onForget={noop}
          onExtSubmit={noop} onPrepareRewind={noop} onCommitRewind={noop} onPrepareFileRevert={noop} onCommitFileRevert={noop} port={port} turnRunning={live} />
      )}
      {info && (
        <p className="agentrun-note">
          {live ? t("subagent.tab.continue_note") : t("subagent.tab.finished")}
          {call && onShowCall && <button type="button" data-action="agent.show-call" onClick={() => onShowCall(call)}>{t("subagent.tab.back")}</button>}
        </p>
      )}
      {info && live && (
        <div className="agentrun-reply">
          <textarea
            data-action-change="agent.continue-draft"
            data-action-keydown="agent.continue-send"
            value={draft}
            rows={2}
            placeholder={t("subagent.tab.continue_placeholder")}
            aria-label={t("subagent.tab.continue_placeholder")}
            disabled={sending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return;
              e.preventDefault();
              void send();
            }}
          />
          <button
            type="button"
            className="btn send"
            data-action="agent.continue-send"
            disabled={sending || !draft.trim()}
            aria-busy={sending}
            onClick={() => void send()}
          >
            {t(sending ? "common.sending" : "common.send")}
          </button>
        </div>
      )}
      {sendFailed && <div className="workbench-error" role="alert">{sendFailed}</div>}
    </div>
  );
}
