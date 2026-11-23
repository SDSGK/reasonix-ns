import { StudioIcon, type StudioIconName } from "./StudioIcon";

/**
 * The mark in front of a project's name.
 *
 * The two states of a folder that opens are two glyphs, not one glyph turned
 * sideways: a rotated chevron asks the reader to learn which way round means
 * open, and a leaf's arrow is not drawn at all rather than drawn and hidden.
 *
 * `icon` and `color` are the project's own mark. Left out, the row keeps the
 * folder glyph in the colour it has always had.
 */
export function WsMark({ open, icon = "folder", color }: {
  open: boolean | undefined;
  icon?: StudioIconName;
  color?: string;
}) {
  return (
    <>
      {open === undefined
        ? <span className="wschev ds-chev" data-leaf="" aria-hidden="true" />
        : open
          ? <StudioIcon name="down" className="wschev ds-chev" data-open="" />
          : <StudioIcon name="chevron" className="wschev ds-chev" />}
      <StudioIcon name={icon} className="wsfolder ds-folder" style={color ? { color } : undefined} />
    </>
  );
}
