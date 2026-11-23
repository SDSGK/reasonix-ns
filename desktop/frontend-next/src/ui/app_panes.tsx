import { useCallback, useMemo } from "react";
import { t } from "../i18n";
import type { RuntimeView, TreeWorkspace } from "../port/hub";
import { workspaceContains } from "../port/hub";
import { StudioIcon } from "./StudioIcon";
import { isUnread } from "./unread";

interface PaneTabsInput {
  runtimes: RuntimeView[];
  runs: Record<string, { run: string; live: boolean }>;
  tree: TreeWorkspace[];
  seenTree: TreeWorkspace[];
  remote: Record<string, TreeWorkspace[] | null>;
}

// What the pane area says about itself: the label each pane carries, whether
// it is still working, whether it holds something new, and whether the panes
// span more than one folder.
export function usePaneTabs({ runtimes, runs, tree, seenTree, remote }: PaneTabsInput) {
  // A pane's label comes from the tree row it opened, so the sidebar and the
  // tab never disagree. An unnamed session gets a number rather than a third
  // "新会话" — with several open, identical labels are the same as no labels.
  const titleFor = useCallback(
    (rt: RuntimeView, at: number) => {
      for (const ws of rt.host ? remote[rt.host] ?? [] : tree) {
        for (const session of ws.sessions) {
          // An unwritten one has only a file name; the numbered fallback reads better.
          const held = rt.host ? workspaceContains(ws, rt.root) && session.path === rt.sessionPath : session.runtimeId === rt.id;
          if (held && (session.title || session.turns)) return session.title || session.name;
        }
      }
      return at === 0 ? t("common.new_session") : t("app.new_session_n", { n: at + 1 });
    },
    [tree, remote],
  );

  const tabs = useMemo(
    () =>
      runtimes.map((rt, i) => ({
        rt,
        title: titleFor(rt, i),
        run: runs[rt.id]?.run ?? "idle",
        live: runs[rt.id]?.live ?? false,
        unread: isUnread(rt, seenTree, remote),
      })),
    [runtimes, titleFor, runs, seenTree, remote],
  );
  // The folder only earns tab space when the panes actually span more than one.
  const manyRoots = useMemo(() => new Set(runtimes.map((rt) => rt.root)).size > 1, [runtimes]);
  return { tabs, manyRoots };
}

interface PanesEmptyProps {
  treeRead: boolean;
  treeEmpty: boolean;
  addBusy: boolean;
  onNew: () => void;
  onAdd: () => void;
}

// The pane area with nothing open in it: the invitation to start a
// conversation, and the folder to add when the machine has none yet.
export function PanesEmpty({ treeRead, treeEmpty, addBusy, onNew, onAdd }: PanesEmptyProps) {
  return (
    <div className="panes-empty">
      <span className="mk" aria-hidden="true"><StudioIcon name="chat" /></span>
      <p className="t">{t("app.no_session_open")}</p>
      {!treeRead ? null : treeEmpty ? (
        <>
          <p className="h">{t("app.you_can_start_without_a")}</p>
          <button data-action="session.new" onClick={onNew}>{t("common.start_a_new_session")}</button>
          <button data-action="workspace.add" disabled={addBusy} onClick={onAdd}>{t("app.add_folder")}</button>
        </>
      ) : (
        <>
          <p className="h">{t("app.pick_one_on_the_left")}</p>
          <button data-action="session.new" onClick={onNew}>{t("common.start_a_new_session")}</button>
        </>
      )}
    </div>
  );
}
