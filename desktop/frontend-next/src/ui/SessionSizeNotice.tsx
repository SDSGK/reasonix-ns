import { useState } from "react";
import { t } from "../i18n";
import type { ContextBreakdown, SessionUsage } from "../port/port";
import { StudioIcon } from "./StudioIcon";

const SEEN_KEY = "reasonix:session-size-seen";

/** How many windows' worth of history the model has read for this session.
 *
 *  Every turn sends the whole of what was said before it again, so a
 *  conversation that has been read back many times over is one where each
 *  new turn pays for all of it. The ledger counts what this session has
 *  cost in prompt tokens; the window says what one reading is worth, and the
 *  ratio is the number of readings. It needs no window of its own to mean
 *  anything. */
export function sessionReadings(usage: SessionUsage | undefined, ctx: ContextBreakdown | null): number {
  const window = ctx?.window ?? 0;
  const read = usage?.promptTokens ?? 0;
  if (!window || !read) return 0;
  return read / window;
}

// Four readings of the whole history is where a conversation stops being a
// short one: what it costs is no longer a few turns but all of it, over and
// over. The kernel keeps folding it, so the fold bar shows the symptom and
// this says what it means.
const READINGS_BEFORE_ADVICE = 4;

function seen(path: string): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === path;
  } catch {
    return false;
  }
}

function markSeen(path: string) {
  try {
    localStorage.setItem(SEEN_KEY, path);
  } catch {
    // A viewer convenience: without storage the note returns next launch.
  }
}

/** Says that a conversation has grown past what a turn should carry, and
 *  that a new one would cost less. It says it once per session: a window
 *  that keeps saying it is a window nobody reads. */
export function SessionSizeNotice({ usage, ctx, path }: {
  usage?: SessionUsage;
  ctx: ContextBreakdown | null;
  path?: string;
}) {
  // The dismissed path, not a flag: a flag would keep the notice away from
  // the next conversation too.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const readings = sessionReadings(usage, ctx);
  if (dismissed === path || !path || seen(path) || readings < READINGS_BEFORE_ADVICE) return null;
  return (
    <div className="rtbar" data-lvl="warn" role="status">
      <StudioIcon name="warning" />
      <span className="t">{t("session.this_conversation_has_grown_long")}</span>
      <span className="why">{t("session.the_model_has_read_it_n_times", { n: Math.round(readings) })}</span>
      <span className="why">{t("session.each_turn_reads_that_history_again")}</span>
      <button data-action="session.size-advice-dismiss" onClick={() => { markSeen(path ?? ""); setDismissed(path ?? ""); }}>{t("common.got_it")}</button>
    </div>
  );
}
