import { StudioIcon } from "./StudioIcon";
import { Fragment, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { ICON, NAV, SECTION_DESC, SETTINGS, leavesOf, pageHome, type Section, type SettingEntry } from "./prefsnav";
import { arrowTabs } from "./tablist";
import { pagesOf } from "./settingPages";
import { UpdateDot } from "./UpdateDot";
import { useFolded } from "./usefold";
import { listenAction } from "./listen";
import { useShellGraphics } from "./GraphicsSection";
import { host } from "../port/host";

interface Props {
  at: Section;
  values: Record<Section, string>;
  shown: (id: Section) => boolean;
  danger: (id: Section) => boolean;
  disabled: boolean;
  onSelect: (id: Section) => void;
  page?: string;
  onPage?: (section: Section, page: string) => void;
  /** Where the reader asked to be taken: a block inside a section. The scroll
   *  belongs to the screen that owns the column — this list only says which
   *  block, and the screen decides where the column is scrolled to. */
  onAnchor?: (section: Section, anchor: string) => void;
}

export function SettingsNav({ at, values, shown, danger, disabled, onSelect, page, onPage, onAnchor }: Props) {
  const strip = useRef<HTMLElement>(null);
  const phone = useFolded("phone");
  // The tree opens on the section being read and folds the rest away: every
  // block of every section at once is a list nobody can aim at.
  const [open, setOpen] = useState<Section | null>(at);
  useEffect(() => { setOpen(at); }, [at]);
  // The same visibility the search answers by, so the list never offers a
  // block the page does not draw.
  const graphics = useShellGraphics();
  const inShell = host().inShell();
  const drawable = (e: SettingEntry) =>
    !e.hidden && shown(e.section) &&
    (e.anchor !== "graphics" || graphics !== null) &&
    (e.anchor !== "global-shortcut" || inShell);
  useEffect(() => {
    if (!phone) return;
    strip.current?.querySelector("[aria-selected='true'], [data-open]")?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [phone, at, page]);
  useEffect(() => {
    const nav = strip.current;
    if (!phone || !nav) return;
    const sideways = (e: Event) => {
      const wheel = e as WheelEvent;
      if (wheel.deltaX !== 0 || wheel.deltaY === 0) return;
      nav.scrollLeft += wheel.deltaY;
      wheel.preventDefault();
    };
    return listenAction(nav, "wheel", { action: "settings.sections-scroll", listener: sideways }, { passive: false });
  }, [phone]);
  const jump = (entry: SettingEntry) => {
    // Without a screen to scroll, the best the list can do is open the page
    // the block lives on.
    if (onAnchor) onAnchor(entry.section, entry.anchor);
    else onSelect(pageHome(entry.section));
  };
  return (
    <nav ref={strip} className="prefs-nav" role="tablist" aria-label={t("settings.settings_sections")} onKeyDown={arrowTabs}>
      {NAV.map(([group, items]) => {
        const rows = items.filter(([id]) => shown(id));
        if (rows.length === 0) return null;
        return (
          <Fragment key={group}>
            {group && <div className="navsec">{t(group)}</div>}
            {rows.map(([id, name]) => {
              const leaves = leavesOf(id)
                .filter((leaf) => drawable(leaf.entry))
                .map((leaf) => ({ ...leaf, children: leaf.children.filter(drawable) }));
              const folded = open === id;
              return (
                <Fragment key={id}>
                  <div className="prefs-row">
                    <button id={`prefs-${id}`} role="tab" className="prefs-tab" title={[t(name), values[id]].filter(Boolean).join(" · ")}
                      data-action="settings.section" data-value={id}
                      tabIndex={at === id && pagesOf(id).length === 0 ? 0 : -1} data-open={folded ? "" : undefined}
                      aria-selected={at === id} disabled={disabled} data-danger={danger(id) ? "" : undefined}
                      onClick={() => onSelect(id)}>
                      {ICON[id]}
                      {id === "account" && <UpdateDot />}
                      <span className="nm">{t(name)}</span>
                    </button>
                    <button className="prefs-twist" title={`${folded ? t("收起") : t("展开")}：${t(name)}`}
                      data-action="settings.nav-toggle" data-value={id}
                      aria-expanded={folded} aria-label={`${folded ? t("收起") : t("展开")}：${t(name)}`}
                      disabled={disabled} onClick={() => setOpen((cur) => (cur === id ? null : id))}>
                      <StudioIcon name={folded ? "minus" : "plus"} />
                    </button>
                  </div>
                  {folded && (
                    <div className="prefs-tree" role="group" aria-label={t(name)}>
                      {leaves.map((leaf) => (
                        <Fragment key={leaf.entry.anchor}>
                          <button id={`prefs-${id}-${leaf.entry.anchor}`} role="link" className="prefs-leaf" title={t(leaf.entry.title)}
                            data-action="settings.section" data-value={id} data-target={leaf.entry.anchor}
                            tabIndex={0} disabled={disabled}
                            onClick={() => jump(leaf.entry)}>
                            <span className="nm">{t(leaf.entry.title)}</span>
                          </button>
                          {leaf.children.map((child) => (
                            <button key={child.anchor} id={`prefs-${id}-${child.anchor}`} role="link" className="prefs-leaf prefs-leaf-sub" title={t(child.title)}
                              data-action="settings.section" data-value={id} data-target={child.anchor}
                              tabIndex={0} disabled={disabled}
                              onClick={() => jump(child)}>
                              <span className="nm">{t(child.title)}</span>
                            </button>
                          ))}
                        </Fragment>
                      ))}
                      {pagesOf(id).map((p) => (
                        <button key={p.id} id={`prefs-${id}-${p.id}`} role="tab" className="prefs-page" title={t(p.label)}
                          data-action="settings.page" data-value={`${id}:${p.id}`}
                          tabIndex={page === p.id ? 0 : -1} aria-selected={page === p.id} disabled={disabled}
                          onClick={() => onPage?.(id, p.id)}>
                          <span className="nm">{t(p.label)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </Fragment>
              );
            })}
          </Fragment>
        );
      })}
    </nav>
  );
}

export function SettingsTitle({ at }: { at: Section }) {
  const group = NAV.find(([, items]) => items.some(([id]) => id === at));
  const name = group?.[1].find(([id]) => id === at)?.[1] ?? at;
  const count = SETTINGS.filter((e) => !e.hidden && !e.within && pageHome(e.section) === at).length;
  const desc = SECTION_DESC[at];
  return (
    <div className="prefs-pagetitle">
      {group?.[0] && <span className="group">{t(group[0])}<StudioIcon name="chevron" /></span>}
      <h2>{t(name)}</h2>
      {(desc || count > 0) && (
        <span className="desc">
          {desc && <span className="what">{t(desc)}</span>}
          {count > 0 && <span className="count">{t("settings.n_items", { n: count })}</span>}
        </span>
      )}
      <p className="usual">{t("settings.page_usual")}</p>
    </div>
  );
}
