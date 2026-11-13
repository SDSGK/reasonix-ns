import { useEffect, useMemo, useRef, useState } from "react";
import type { JobEntry, JobOutput } from "../port/port";
import type { ProcessEntry } from "../port/process";
import { t } from "../i18n";
import { reason } from "../i18n/kernel";
import { StudioIcon } from "./StudioIcon";
import { JobDeck } from "./JobDeck";
import { ProcessDeck } from "./ProcessDeck";
import { JobOutputView } from "./panels/JobOutputView";
import { useDismiss } from "./dismiss";

export type Deck = "" | "jobs" | "processes";

/** What this session runs in the background: one chip per surface, each
 *  opening its own popover. Delegates are not here — they live in the badge
 *  at the top of the window. */
export function DeckChips({ jobs, open, onOpen, onCancelJob, onReadJob, onReadProcesses, onClearJobs, onOpenJob }: { jobs: JobEntry[]; open: Deck; onOpen: (next: (was: Deck) => Deck) => void; onCancelJob?: (id: string) => Promise<void>; onReadJob?: (id: string) => Promise<JobOutput>; onClearJobs?: (ids: string[]) => void; onOpenJob?: (job: JobEntry) => void; onReadProcesses?: () => Promise<ProcessEntry[]> }) {
  const jobsBox = useRef<HTMLDivElement>(null);
  const processBox = useRef<HTMLDivElement>(null);
  const [processes, setProcesses] = useState<ProcessEntry[]>([]);
  const [processError, setProcessError] = useState("");
  const [viewingJob, setViewingJob] = useState("");
  useEffect(() => {
    if (open !== "processes" || !onReadProcesses) return;
    let current = true;
    onReadProcesses().then(
      (rows) => { if (current) { setProcesses(rows); setProcessError(""); } },
      (e: unknown) => { if (current) { setProcesses([]); setProcessError(reason(e)); } },
    );
    return () => { current = false; };
  }, [open, onReadProcesses, jobs]);
  const liveJobs = useMemo(() => jobs.filter((j) => j.status === "running").length, [jobs]);
  // A failure stays loud until the list has been opened on it.
  const [seenFailed, setSeenFailed] = useState<ReadonlySet<string>>(() => new Set());
  const failedJobs = useMemo(() => jobs.filter((j) => j.status === "failed" && !seenFailed.has(j.id)).length, [jobs, seenFailed]);
  useEffect(() => {
    if (open !== "jobs") return;
    const failed = jobs.filter((j) => j.status === "failed" && !seenFailed.has(j.id));
    if (failed.length) setSeenFailed((was) => new Set([...was, ...failed.map((j) => j.id)]));
  }, [open, jobs, seenFailed]);
  useDismiss(open === "jobs", jobsBox, shut);
  useDismiss(open === "processes", processBox, shut);
  if (jobs.length === 0 && processes.length === 0) return null;

  return (
    <>
      {onReadProcesses && (
        <div ref={processBox} className="studio-deck-anchor" data-open={open === "processes" ? "" : undefined}>
          <button
            type="button"
            className="studio-deckchip"
            data-action="deck.processes"
            aria-label={t("subagent.process.chip")}
            title={t("subagent.process.chip")}
            data-live={liveJobs || processes.length ? "" : undefined}
            aria-expanded={open === "processes"}
            aria-haspopup="dialog"
            onClick={() => onOpen((was) => (was === "processes" ? "" : "processes"))}
          >
            <StudioIcon name="play" />
            <span>{t("subagent.process.chip")}</span>
          </button>
          <div className="studio-deck-pop" role="dialog" aria-label={t("subagent.process.chip")}>
            <ProcessDeck rows={processes} error={processError} />
          </div>
        </div>
      )}
      {jobs.length > 0 && (
        <div ref={jobsBox} className="studio-deck-anchor" data-open={open === "jobs" ? "" : undefined}>
          <button
            type="button"
            className="studio-deckchip"
            data-action="deck.jobs"
            aria-label={t("common.background_jobs")}
            title={t("common.background_jobs")}
            data-live={liveJobs ? "" : undefined}
            data-failed={!liveJobs && failedJobs ? "" : undefined}
            aria-expanded={open === "jobs"}
            aria-haspopup="dialog"
            onClick={() => onOpen((was) => (was === "jobs" ? "" : "jobs"))}
          >
            {liveJobs > 0 && <i className="agent-live" aria-hidden="true" />}
            <StudioIcon name="play" />
            <b>{liveJobs || failedJobs || jobs.length}</b>
            <span>{liveJobs ? t("subagent.background_jobs_running") : failedJobs ? t("subagent.background_jobs_failed") : t("subagent.background_jobs_done")}</span>
          </button>
          <div className="studio-deck-pop" role="dialog" aria-label={t("common.background_jobs")}>
            <JobDeck jobs={jobs} onCancel={onCancelJob} onClear={onClearJobs} onView={onOpenJob || onReadJob ? (id) => { shut(); const job = jobs.find((j) => j.id === id); if (onOpenJob && job) onOpenJob(job); else setViewingJob(id); } : undefined} />
          </div>
        </div>
      )}
      {viewingJob && onReadJob && jobs.some((j) => j.id === viewingJob) && (
        <JobOutputView job={jobs.find((j) => j.id === viewingJob)!} read={onReadJob} onClose={() => setViewingJob("")} onCancel={onCancelJob} />
      )}
    </>
  );

  function shut() {
    onOpen(() => "");
  }
}
