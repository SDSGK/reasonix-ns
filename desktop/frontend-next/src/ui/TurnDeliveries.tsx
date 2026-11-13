import { useState } from "react";
import { t } from "../i18n";
import { tokens } from "../i18n/format";
import { DiffView } from "./cards/DiffView";
import type { Item } from "../state/session";

// One file a turn delivered. The last delivery of a path wins: an earlier edit
// of the same file is superseded by the later call's final state, so the list
// never shows a file twice or a stale diff.
export interface TurnDelivery {
  path: string;
  description?: string;
  added?: number;
  removed?: number;
  diff?: string;
  toolName: string;
}

// The current turn starts at the last user message and runs to the end of the
// transcript. A delivery is a writer call's own record of the files it changed
// (Tool.deliveries), so shell output that merely looks like a diff never
// counts, and reads never show up here.
export function deliveriesOf(items: readonly Item[]): TurnDelivery[] {
  let start = -1;
  for (let i = 0; i < items.length; i++) {
    if (items[i].t === "user") start = i;
  }
  if (start < 0) return [];
  const byPath = new Map<string, TurnDelivery>();
  for (const item of items.slice(start)) {
    if (item.t !== "tool") continue;
    const tool = item.tool;
    for (const d of tool.deliveries ?? []) {
      byPath.set(d.path, {
        path: d.path,
        description: d.description,
        added: tool.added,
        removed: tool.removed,
        diff: tool.diff,
        toolName: tool.name,
      });
    }
  }
  return [...byPath.values()];
}

/** The turn's own file deliveries, listed above the input box: what this task
 *  changed stays with this task, so a long conversation never blurs which
 *  files belong to the question you just asked. A row with a diff opens it in
 *  place; the list collapses to one line while you read the transcript. */
export function TurnDeliveries({ items }: { items: readonly Item[] }) {
  const deliveries = deliveriesOf(items);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState("");
  if (deliveries.length === 0) return null;
  const up = deliveries.reduce((n, d) => n + (d.added ?? 0), 0);
  const down = deliveries.reduce((n, d) => n + (d.removed ?? 0), 0);
  const viewed = deliveries.find((d) => d.path === viewing && d.diff);
  return (
    <div className="turndeliver" data-open={open || undefined}>
      <button
        type="button"
        className="turndeliver-head"
        data-action="deliveries.toggle"
        aria-expanded={open}
        onClick={() => setOpen((on) => !on)}
      >
        <b>{t("本次改动 · {n} 个文件", { n: deliveries.length })}</b>
        {(up > 0 || down > 0) && (
          <span className="turndeliver-io">
            <i data-io="up">+{tokens(up)}</i> <i data-io="down">−{tokens(down)}</i>
          </span>
        )}
        <span className="turndeliver-caret" aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <ul className="turndeliver-list">
          {deliveries.map((d) => (
            <li key={d.path}>
              {d.diff ? (
                <button
                  type="button"
                  className="turndeliver-file"
                  data-action="deliveries.view"
                  data-active={viewing === d.path || undefined}
                  title={t("查看 {path} 的改动", { path: d.path })}
                  onClick={() => setViewing(viewing === d.path ? "" : d.path)}
                >
                  {d.path}
                </button>
              ) : (
                <span className="turndeliver-file">{d.path}</span>
              )}
              {(d.added !== undefined || d.removed !== undefined) && (
                <span className="turndeliver-io">
                  <i data-io="up">+{tokens(d.added ?? 0)}</i> <i data-io="down">−{tokens(d.removed ?? 0)}</i>
                </span>
              )}
            </li>
          ))}
          <li className="turndeliver-hint">{t("点击文件名查看改动")}</li>
        </ul>
      )}
      {open && viewed?.diff && (
        <div className="turndeliver-diff">
          <DiffView diff={viewed.diff} path={viewed.path} />
        </div>
      )}
    </div>
  );
}
