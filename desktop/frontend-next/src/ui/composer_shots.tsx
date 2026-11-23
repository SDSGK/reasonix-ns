import { createElement, type Dispatch, type SetStateAction } from "react";
import { t } from "../i18n";
import { fileAppearance } from "./document/FileTypeIcon";
import { ImagePreview } from "./ImagePreview";
import { PasteKeep, type PasteChip } from "./pastekeep";
import { chipName, isPicture, quoteBlock, type Chip } from "./composerChips";
import { StudioIcon } from "./StudioIcon";

// The material riding along with the turn, listed above the box. It lives in
// its own file because the composer is about the box and the row of controls;
// the list is about what the turn carries.
interface Props {
  shots: Chip[];
  setShots: Dispatch<SetStateAction<Chip[]>>;
  discard: (c: Chip) => void;
  insert: (snippet: string) => void;
  upload: (id: string, blob: File) => void;
  keepPaste: (chip: PasteChip) => void;
}

export function ComposerShots({ shots, setShots, discard, insert, upload, keepPaste }: Props) {
  return (
    <ul className="shots">
      {shots.map((c, i) => (
        <li
          className="shot"
          key={c.id}
          data-state={c.k === "attachment" ? c.state : undefined}
          style={{ "--i": i } as React.CSSProperties}
        >
          {c.k === "attachment" ? (
            <>
              {isPicture(c) ? (
                <ImagePreview src={c.url} name={c.name}
                  className="thumb"
                >
                  <span aria-hidden="true" style={c.url ? { backgroundImage: `url(${c.url})` } : undefined} />
                </ImagePreview>
              ) : (
                <span className="glyph" aria-hidden="true">{createElement(fileAppearance(c.a?.path ?? c.name).icon, { size: 20, strokeWidth: 1.8 })}</span>
              )}
              <span className="meta">
                <span className="nm" title={c.a?.path ?? c.name}>{c.name}</span>
                {c.state === "adding" && <span className="sz live">{t("composer.adding")}</span>}
                {c.state === "ready" && <span className="sz">{isPicture(c) ? t("composer.image") : t("common.files")}</span>}
                {c.state === "failed" && c.error && <span className="why" title={c.error}>{c.error}</span>}
                {c.state === "failed" && (
    <button
                    className="retry"
                    data-action="session.attach"
                    onClick={() => {
                      if (!c.blob) return;
                      setShots((prev) => prev.map((x) => (x === c ? { ...c, state: "adding", error: "" } : x)));
                      upload(c.id, c.blob);
                    }}
                  >
                    {t("composer.could_not_add_retry")}
                  </button>
                )}
              </span>
            </>
          ) : c.k === "session" ? (
            <>
              <span className="glyph" aria-hidden="true"><StudioIcon name="history" /></span>
              <span className="meta">
                <span className="nm" title={c.title}>{c.title}</span>
                <span className="sz">{t("composer.past_conversation_read_only_reference")}</span>
              </span>
            </>
          ) : (
            <>
              <span className="glyph" aria-hidden="true"><StudioIcon name={c.k === "quote" ? "quote" : "file"} /></span>
              <span className="meta">
                <span className="nm" title={c.body}>{chipName(c)}</span>
                <button
                  className="undo"
                  onClick={() => {
                    discard(c);
                    insert(c.k === "quote" ? quoteBlock(c) : c.body);
                  }}
                >
                  {t("composer.n_lines_put_it_back", { n: c.lines })}
                </button>
                {c.k === "paste" && <PasteKeep chip={c} onKeep={keepPaste} />}
              </span>
            </>
          )}
          <button
            className="x"
            aria-label={t("common.remove_name", { name: chipName(c) })}
            onClick={() => discard(c)}
          >
            <StudioIcon name="close" />
          </button>
        </li>
      ))}
    </ul>
  );
}
