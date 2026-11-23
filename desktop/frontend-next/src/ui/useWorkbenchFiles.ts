import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentPort, WorkspaceFile } from "../port/port";
import type { GitRepoRow } from "../port/workspace";
import { locate } from "../state/gittree";
import { WORKSPACE_FILE_MISSING, reason } from "../i18n/kernel";
import { HttpError } from "../port/port";
import { parseGrantedFile } from "./grantedfiles";
import { t } from "../i18n";

// The kernel's answer when a read names a folder this workspace was not
// granted. The folder is the one a name was resolved against, so it says the
// folder is unknown, not that the file is gone.
const WORKSPACE_ROOT_NOT_GRANTED = "workspace.root_not_granted";

type Entry = {
  file: WorkspaceFile | null; draft: string; diff: string; error: string; missing: boolean;
  errorCode: string;
  pending: "" | "read" | "save"; issued: number;
};
const blank = (): Entry => ({ file: null, draft: "", diff: "", error: "", errorCode: "", missing: false, pending: "", issued: 0 });
const dirty = (entry: Entry) => !!entry.file && entry.draft !== entry.file.content;

// A file is named by the folder it lives in and its name inside that folder.
// The workbench knows the folder a name was resolved against — a reply's link
// names a file in the conversation's workspace — while the kernel resolves a
// bare name against the workspace it holds. A name that reaches the kernel
// without its folder points at the wrong place, and the read answers "not
// there" for a file the reply's own tooltip points at. So the folder travels
// with the read; a kernel that does not hold that folder, or that finds no
// such name in it, reads the name in the workspace itself.
async function readNamed(port: AgentPort, path: string, root: string) {
  if (!root) return port.workspaceFile(path);
  try {
    return await port.workspaceFile(path, root);
  } catch (e) {
    const code = e instanceof HttpError ? e.reason?.code ?? "" : "";
    if (code !== WORKSPACE_FILE_MISSING && code !== WORKSPACE_ROOT_NOT_GRANTED) throw e;
    return await port.workspaceFile(path);
  }
}

export function useWorkbenchFiles({ port, workspaceRoot, repos = [], path, openPaths, shown, refresh, poll }: {
  port: AgentPort; workspaceRoot: string; repos?: GitRepoRow[]; path: string; openPaths: string[]; shown: boolean; refresh: string; poll: boolean;
}) {
  const entries = useMemo(() => new Map<string, Entry>(), [port, workspaceRoot]);
  const current = useRef<Map<string, Entry> | null>(entries);
  current.current = entries;
  const [version, render] = useState(0);
  const notify = useCallback(() => { if (current.current === entries) render((n) => n + 1); }, [entries]);
  const repoList = useRef(repos);
  repoList.current = repos;
  const entry = path ? entries.get(path) ?? blank() : blank();
  if (path && !entries.has(path)) entries.set(path, entry);

  useEffect(() => {
    current.current = entries;
    return () => { current.current = null; };
  }, [entries]);
  useEffect(() => {
    for (const [path, entry] of entries) {
      if (!openPaths.includes(path) && !dirty(entry) && entry.pending !== "save") entries.delete(path);
    }
  }, [entries, openPaths, version]);

  const read = useCallback((quiet = false) => {
    if (!path) return;
    const entry = entries.get(path)!;
    let live = true;
    if (entry.pending === "save" || dirty(entry) || (entry.file && !shown) || (quiet && entry.pending === "read")) return;
    const ticket = ++entry.issued;
    let changed = !quiet || !entry.file;
    void (async () => {
      const valid = () => live && current.current === entries && ticket === entry.issued;
      entry.pending = "read";
      if (!entry.file) { entry.error = ""; entry.missing = false; }
      if (changed) notify();
      try {
        const granted = parseGrantedFile(path);
        const [file, patch] = await Promise.all([
          granted ? port.workspaceFile(granted.rel, granted.root) : readNamed(port, path, workspaceRoot),
          quiet || granted ? Promise.resolve(null) : diffOf(port, repoList.current, path),
        ]);
        if (!valid() || dirty(entry)) return;
        changed ||= entry.file?.content !== file.content || entry.file?.revision !== file.revision || !!entry.error;
        entry.file = file;
        entry.draft = file.content;
        entry.error = "";
        entry.errorCode = "";
        entry.missing = false;
        if (!quiet) entry.diff = patch?.diff ?? "";
      } catch (e) {
        const code = e instanceof HttpError ? e.reason?.code ?? "" : "";
        const unavailable = [WORKSPACE_FILE_MISSING, WORKSPACE_ROOT_NOT_GRANTED, "workspace.preview_denied", "workspace.file_unreadable"].includes(code);
        if (valid() && !dirty(entry) && (!quiet || unavailable)) {
          changed = true;
          entry.error = reason(e);
          entry.errorCode = code;
          entry.missing = e instanceof HttpError && e.reason?.code === WORKSPACE_FILE_MISSING;
          entry.file = null;
          entry.draft = "";
        }
      } finally {
        if (valid()) { entry.pending = ""; if (changed) notify(); }
      }
    })();
    return () => {
      live = false;
      if (ticket === entry.issued) entry.pending = "";
    };
  }, [port, entries, path, shown, notify, workspaceRoot]);
  useEffect(() => read(), [read, refresh]);
  useEffect(() => {
    if (!poll || !shown) return;
    let cancel: (() => void) | undefined;
    const timer = window.setInterval(() => { cancel = read(true) ?? cancel; }, 3000);
    return () => { cancel?.(); window.clearInterval(timer); };
  }, [read, poll, shown]);
  const isDirty = dirty(entry), observedVersion = entry.file?.observedVersion, saving = entry.pending === "save";
  useEffect(() => {
    if (!shown || !isDirty || !observedVersion || saving) return;
    const controller = new AbortController();
    let busy = false;
    const inspect = async () => {
      if (busy) return;
      busy = true;
      try {
        const held = parseGrantedFile(path);
        const info = await port.workspacePreviewInfo({ path: held?.rel ?? path, root: held?.root }, controller.signal);
        if (!controller.signal.aborted && info.version !== entry.file?.observedVersion) {
          const error = t("workbench.the_file_changed_on_disk");
          if (entry.error !== error) { entry.error = error; notify(); }
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          const error = reason(e);
          if (entry.error !== error) { entry.error = error; notify(); }
        }
      } finally { busy = false; }
    };
    void inspect();
    const timer = window.setInterval(() => void inspect(), 3000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [port, entry, path, shown, refresh, isDirty, observedVersion, saving, notify]);

  const setDraft = (draft: string) => {
    if (current.current !== entries || !entry.file || entry.file.readOnly) return;
    entry.draft = draft;
    notify();
  };
  const saveEntry = async (entry: Entry) => {
    if (current.current !== entries || !entry.file || entry.file.readOnly || !dirty(entry) || entry.pending === "save") return;
    const sent = { ...entry.file, content: entry.draft };
    const ticket = ++entry.issued;
    entry.pending = "save";
    entry.error = "";
    notify();
    try {
      const file = await port.saveWorkspaceFile(sent);
      if (current.current !== entries || ticket !== entry.issued) return;
      entry.file = file;
      if (entry.draft === sent.content) entry.draft = file.content;
    } catch (e) {
      if (current.current === entries && ticket === entry.issued) entry.error = reason(e);
    } finally {
      if (current.current === entries && ticket === entry.issued) { entry.pending = ""; notify(); }
    }
  };
  const save = () => saveEntry(entry);
  // Any open file, not only the one on screen: closing a tab asks about its own text.
  // saveAt resolves true once nothing of the file is left unsaved.
  const saveAt = async (at: string) => {
    const e = entries.get(at);
    if (e) await saveEntry(e);
    return !e || !dirty(e);
  };
  const dropAt = (at: string) => {
    const e = entries.get(at);
    if (e?.file) { e.draft = e.file.content; notify(); }
  };
  // Every open file whose draft differs from what was read, for the tabs to mark.
  const unsaved = [...entries].flatMap(([key, e]) => (dirty(e) ? [key] : []));
  return { ...entry, busy: entry.pending === "save" || (!entry.file && entry.pending === "read"), setDraft, save, saveAt, dropAt, unsaved };
}

// The diff of a workspace-relative path, read from the repository that holds it.
function diffOf(port: AgentPort, repos: GitRepoRow[], path: string) {
  const at = locate(repos, path);
  return (at.repo ? port.changeDiff(at.rel, at.repo) : port.changeDiff(path)).catch(() => null);
}
