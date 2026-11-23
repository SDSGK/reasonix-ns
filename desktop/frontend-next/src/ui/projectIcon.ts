// The mark in front of a project name: which glyph, and which colour.
//
// The kernel's project list holds paths and order and nothing else
// (internal/state/workspacelist/list.go), so there is no field for a mark to
// live in. This is therefore a preference of this machine, like the sidebar's
// folded folders (state/sidebarFolds.ts): it is read where the tree is drawn,
// not where the kernel keeps facts.
//
// Everything goes through the store below, so the day the kernel grows a field
// for it, the interface does not change — only the store's implementation.

import { useSyncExternalStore } from "react";
import type { StudioIconName } from "./StudioIcon";

/** A project's glyph and the colour it wears. */
export interface ProjectIconChoice {
  icon: StudioIconName;
  color: ProjectColorId;
}

/** The colours a project may wear. A fixed set, not a free choice: a colour
 *  only this window knows how to draw is a colour the next one cannot, and a
 *  palette the reader can learn is worth more than a picker. */
export type ProjectColorId = "default" | "accent" | "blue" | "teal" | "green" | "amber" | "red" | "pink";

export const PROJECT_COLORS: { id: ProjectColorId; css: string; name: string }[] = [
  { id: "default", css: "var(--muted)", name: "Default" },
  { id: "accent", css: "var(--accent)", name: "Accent" },
  { id: "blue", css: "var(--cat-1)", name: "Blue" },
  { id: "teal", css: "var(--deleg)", name: "Teal" },
  { id: "green", css: "var(--ok)", name: "Green" },
  { id: "amber", css: "var(--warn)", name: "Amber" },
  { id: "red", css: "var(--err)", name: "Red" },
  { id: "pink", css: "var(--cat-5)", name: "Pink" },
];

/** The glyphs a project may wear. A subset of the icon set rather than all of
 *  it: the full set is a catalogue, and a mark is a choice out of a few. */
export const PROJECT_ICONS: StudioIconName[] = [
  "folder", "reveal", "code", "brain", "agent", "server", "plug", "shield",
  "shieldCheck", "bookmark", "chart", "book", "storage", "package", "network",
  "globe", "terminal", "spark", "magic", "target", "layers", "branch",
  "notebook", "palette",
];

const ICON_NAMES = new Set<string>(PROJECT_ICONS);
const COLOR_NAMES = new Set<string>(PROJECT_COLORS.map((c) => c.id));

/** The colour a choice wears, as a CSS value. The default leaves the row's own
 *  colour alone, so a project that was never configured looks as it always
 *  did. */
export function projectColorCss(color: ProjectColorId | undefined): string | undefined {
  if (!color || color === "default") return undefined;
  return PROJECT_COLORS.find((c) => c.id === color)?.css;
}

/** Reads a stored choice, and refuses one that names an icon or a colour this
 *  build does not have: a hand-edited file must not draw a glyph that is not
 *  there. */
function normalize(value: unknown): ProjectIconChoice | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as { icon?: unknown; color?: unknown };
  if (typeof raw.icon !== "string" || !ICON_NAMES.has(raw.icon)) return undefined;
  if (typeof raw.color !== "string" || !COLOR_NAMES.has(raw.color)) return undefined;
  return { icon: raw.icon as StudioIconName, color: raw.color as ProjectColorId };
}

/** Where a project's mark is kept. The interface asks this and nothing else,
 *  so the storage underneath can change without the tree noticing. */
export interface ProjectIconStore {
  /** Every project's mark, by workspace root. */
  all(): Record<string, ProjectIconChoice>;
  read(root: string): ProjectIconChoice | undefined;
  /** Writes a project's mark, or clears it when the choice is undefined. */
  write(root: string, choice: ProjectIconChoice | undefined): void;
  subscribe(listener: () => void): () => void;
}

const KEY = "rx-project-icons";

/** The store that keeps marks in this window's own storage. The key is the
 *  workspace root, the same identity the tree and the kernel use for a
 *  project, so a mark follows the folder rather than the row's position. */
class LocalProjectIconStore implements ProjectIconStore {
  private raw: string | null = null;
  private table: Record<string, ProjectIconChoice> = {};
  private listeners = new Set<() => void>();

  /** Reads the stored marks. The parsed table is kept so that reading twice
   *  gives the same object: a snapshot that changed on every call would send
   *  the tree into an endless repaint. */
  private load(): Record<string, ProjectIconChoice> {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      raw = null;
    }
    if (raw === this.raw) return this.table;
    this.raw = raw;
    const table: Record<string, ProjectIconChoice> = {};
    try {
      const parsed: unknown = JSON.parse(raw ?? "{}");
      if (parsed && typeof parsed === "object") {
        for (const [root, value] of Object.entries(parsed as Record<string, unknown>)) {
          const choice = normalize(value);
          if (choice) table[root] = choice;
        }
      }
    } catch {
      // A file that cannot be read is a file that holds no marks.
    }
    this.table = table;
    return table;
  }

  private save(table: Record<string, ProjectIconChoice>) {
    this.table = table;
    try {
      localStorage.setItem(KEY, JSON.stringify(table));
      this.raw = localStorage.getItem(KEY);
    } catch {
      // A window that cannot persist keeps the mark for this session only.
      this.raw = JSON.stringify(table);
    }
    this.listeners.forEach((listener) => listener());
  }

  all() {
    return this.load();
  }

  read(root: string) {
    return this.load()[root];
  }

  write(root: string, choice: ProjectIconChoice | undefined) {
    const next = { ...this.load() };
    if (choice) next[root] = choice;
    else delete next[root];
    this.save(next);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export const projectIcons: ProjectIconStore = new LocalProjectIconStore();

/** Every project's mark, and a repaint whenever one changes. */
export function useProjectIcons(): Record<string, ProjectIconChoice> {
  return useSyncExternalStore(projectIcons.subscribe, () => projectIcons.all(), () => projectIcons.all());
}

/** Sets a project's mark. */
export function setProjectIcon(root: string, icon: StudioIconName, color: ProjectColorId): void {
  projectIcons.write(root, { icon, color });
}

/** Puts a project's mark back to the one it was born with: the folder glyph in
 *  the row's own colour. */
export function resetProjectIcon(root: string): void {
  projectIcons.write(root, undefined);
}
