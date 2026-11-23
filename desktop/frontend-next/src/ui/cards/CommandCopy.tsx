import { useEffect, useRef, useState, type MouseEvent } from "react";
import { t } from "../../i18n";
import { copyText } from "../CopyButton";
import { StudioIcon } from "../StudioIcon";
import { TooltipButton } from "../TooltipButton";

/** The command as the shell received it. The row shows a fragment of it, so
 *  the clipboard is answered from the payload: what ran, in full, is the only
 *  way to see what a call actually did. */
export function commandOf(raw: string | undefined): string {
  if (!raw) return "";
  try {
    const read = (payload: unknown): string => {
      if (!payload || typeof payload !== "object") return "";
      const record = payload as Record<string, unknown>;
      const command = record.command;
      if (typeof command === "string" && command.trim()) return command;
      // A stable proxy nests the real call under `arguments`.
      return read(record.arguments);
    };
    return read(JSON.parse(raw));
  } catch {
    // A payload that never parsed is not a command, and its innards are not
    // one either.
    return "";
  }
}

/** The copy control beside a command. It sits in the row that names the call,
 *  which is a summary: the click copies, and the call stays as it was. */
export function CommandCopy({ command }: { command: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const copy = (event: MouseEvent<HTMLButtonElement>) => {
    // The row is a summary: copying from it must not fold the call away.
    event.preventDefault();
    event.stopPropagation();
    if (timer.current !== null) window.clearTimeout(timer.current);
    copyText(command)
      .then(() => setState("done"))
      .catch(() => setState("failed"))
      .finally(() => { timer.current = window.setTimeout(() => setState("idle"), 1600); });
  };

  const label = state === "done" ? t("common.copied") : state === "failed" ? t("common.copy_failed_try_again") : t("chat.copy_the_command");
  return (
    <TooltipButton
      className="cmd-copy"
      type="button"
      data-action="tool.copy-command"
      data-state={state}
      title={label}
      aria-label={label}
      onClick={copy}
    >
      <StudioIcon name={state === "done" ? "check" : state === "failed" ? "warning" : "copy"} />
    </TooltipButton>
  );
}
