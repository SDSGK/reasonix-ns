// The panel that gives a project its own glyph and colour. The mark itself
// lives in the store the whole sidebar reads (projectIcon.ts); this holds the
// entry that opens the choice, and the choices themselves.

import { type CSSProperties } from "react";
import { t } from "../i18n";
import { StudioIcon } from "./StudioIcon";
import { PROJECT_COLORS, PROJECT_ICONS, resetProjectIcon, setProjectIcon, type ProjectIconChoice } from "./projectIcon";

interface Props {
  /** The project this mark belongs to. */
  root: string;
  /** The mark it wears now, if it was ever given one. */
  mark: ProjectIconChoice | undefined;
  /** Whether the choices are showing. */
  iconPanel: boolean;
  /** Opens or closes the choices. */
  setIconPanel: (open: boolean) => void;
}

export function ProjectIconPanel({ root, mark, iconPanel, setIconPanel }: Props) {
  // What the row wears now, whether or not anyone chose it: the
  // folder in the colour the row already had.
  const worn = { icon: mark?.icon ?? "folder", color: mark?.color ?? "default" };
  return (
    <>
      {/* A project's own mark: which glyph, which colour. The
          entry is a checkbox rather than another command, so it
          says whether the panel below it is open; the choices
          themselves are radio items, one chosen at a time. */}
      <div className="session-pop-group">
        <button role="menuitemcheckbox" aria-checked={iconPanel} data-action="workspace.configure" data-value="project-icon"
          onClick={() => setIconPanel(!iconPanel)}>
          <StudioIcon name="palette" /><span>{t("settings.appearance")}</span>
        </button>
      </div>
      {iconPanel && (
        <div className="project-icon-panel">
          <div className="project-icon-grid" role="group" aria-label={t("settings.appearance")}>
            {PROJECT_ICONS.map((name) => (
              <button key={name} role="menuitemradio" aria-checked={worn.icon === name} data-action="workspace.configure" data-value={name} title={name}
                onClick={() => setProjectIcon(root, name, mark?.color ?? "default")}>
                <StudioIcon name={name} />
              </button>
            ))}
          </div>
          <div className="project-color-row" role="group" aria-label="Color">
            {PROJECT_COLORS.map((color) => (
              <button key={color.id} role="menuitemradio" aria-checked={worn.color === color.id} aria-label={color.name} title={color.name}
                data-action="workspace.configure" data-value={color.id} style={{ "--swatch": color.css } as CSSProperties}
                onClick={() => setProjectIcon(root, mark?.icon ?? "folder", color.id)}>
              </button>
            ))}
          </div>
          <button className="project-icon-reset" role="menuitemradio" aria-checked={worn.icon === "folder" && worn.color === "default"} data-action="workspace.configure" data-value="reset"
            onClick={() => resetProjectIcon(root)}>{t("common.default")}</button>
        </div>
      )}
    </>
  );
}
