import type { BrowserTab } from "../port/port";
import type { SubagentState } from "../port/subagent";
import { t } from "../i18n";
import { delegateStateLabel } from "./delegation";

export type Surface =
  | { kind: "manual"; id: string }
  | { kind: "browser"; tab: BrowserTab }
  | { kind: "file"; path: string }
  | { kind: "agent"; ref: string; name: string; state?: SubagentState }
  | { kind: "job"; id: string; name: string }
  | { kind: "terminal"; id: string; name: string; busy: boolean }
  | { kind: "changes" };
export function keyOf(s: Surface) {
  if (s.kind === "changes") return "changes:";
  return `${s.kind}:${s.kind === "manual" || s.kind === "job" || s.kind === "terminal" ? s.id : s.kind === "browser" ? s.tab.target : s.kind === "agent" ? s.ref : s.path}`;
}
export function labelOf(s: Surface, hosts: Record<string, string>) {
  if (s.kind === "changes") return t("common.changes");
  if (s.kind === "agent") return agentLabel(s);
  return s.kind === "manual"
    ? hosts[s.id] || t("workbench.browser")
    : s.kind === "browser"
      ? s.tab.title || s.tab.url || t("common.blank_page")
      : s.kind === "job" || s.kind === "terminal"
        ? s.name
        : s.path.split("/").at(-1) || s.path;
}

/** agentLabel names a sub-agent's tab and says where its run stands: a reader
 *  must not have to open the tab to learn whether the run is still working.
 *  A run whose state the kernel has not said yet is named alone. */
function agentLabel(s: { name: string; state?: SubagentState }): string {
  if (!s.state) return s.name;
  return `${s.name} · ${delegateStateLabel(s.state)}`;
}

// The tab strip's own measures. The strip is a row of tabs that share one
// width: each keeps its own title as long as they all fit, and they narrow
// together when they do not — the way a browser's tab bar does.
export const TAB_MAX_WIDTH = 168;
export const TAB_MIN_WIDTH = 60;
export const TAB_GAP = 2;
/** What a tab costs besides its title: the icon, the gap, the padding and the
 *  close button it keeps beside it. */
export const TAB_CHROME = 58;
/** Below this a tab cannot hold a whole title, so it keeps only its first
 *  characters and the full name waits in the tooltip. */
export const TAB_NARROW_WIDTH = 120;
export const TAB_TITLE_CHARS = 4;

/** The width each tab may take, or null when the tabs already fit and may
 *  keep their own. The strip is one row: the tabs share what is left, so the
 *  narrowest any of them may become is the floor. */
export function fitTabs(naturals: number[], available: number): number | null {
  const count = naturals.length;
  if (!count || available <= 0) return null;
  const needed = naturals.reduce((sum, n) => sum + n, 0) + TAB_GAP * (count - 1);
  if (needed <= available) return null;
  const share = Math.floor((available - TAB_GAP * (count - 1)) / count);
  return Math.max(TAB_MIN_WIDTH, Math.min(TAB_MAX_WIDTH, share));
}

/** The title a narrow tab shows: the first few characters of the name, so two
 *  neighbours can still be told apart. */
export function shortTitle(title: string, keep = TAB_TITLE_CHARS): string {
  return [...title].slice(0, keep).join("");
}
