import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { StudioIcon } from "./StudioIcon";
import { reason } from "../i18n/kernel";
import type { AgentPort, ApprovalMode, SessionStatus } from "../port/port";
import { useDismiss } from "./dismiss";
import { APPROVALS, approvalName } from "./approvals";
import { ALLOW_ALL, AllowAllConfirm, applyMode } from "./allowAll";

// Permission is one boundary, not a catch-all for every way a turn can run.
// Work strategy and model effort live in their own controls beside this one.
interface Props {
  port: AgentPort;
  status: SessionStatus | null;
  onChanged: () => void;
  onBoundary?: () => void;
}

export function Policy({ port, status, onChanged, onBoundary }: Props) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState("");
  const [refused, setRefused] = useState("");
  // 「全部放行」asks first: it is the one choice that takes the sandbox down
  // with it, and that is not visible afterwards.
  const [confirming, setConfirming] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(open, wrap, () => setOpen(false));
  // 菜单收起时那句确认也该收起来：它问的是菜单里的那一档，菜单不在了，
  // 问的就没有对象了。
  useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  if (!status) return null;

  const apv = status.toolApprovalMode ?? "ask";
  const label = approvalName(apv);
  const apply = (value: ApprovalMode) => {
    if (asking) return;
    if (value === ALLOW_ALL) {
      setConfirming(true);
      return;
    }
    // 选了别的档位，那句「全部放行」的确认就该收起来：它问的是这一档，
    // 而这一档已经不是要选的那一档了。
    setConfirming(false);
    setAsking(value);
    setRefused("");
    applyMode(port, value)
      .then(onChanged)
      .catch((e: unknown) => setRefused(reason(e)))
      .finally(() => setAsking(""));
  };
  const allowAll = () => {
    setConfirming(false);
    setAsking(ALLOW_ALL);
    setRefused("");
    applyMode(port, ALLOW_ALL)
      .then(onChanged)
      .catch((e: unknown) => setRefused(reason(e)))
      .finally(() => setAsking(""));
  };

  return (
    <div
      className="picker policy"
      ref={wrap}
      data-quiet={apv === "ask" ? "" : undefined}
    >
      <button
        className="mode plain"
        data-action="chrome.policy"
        data-risk={apv === "yolo" ? "" : undefined}
        aria-expanded={open}
        aria-label={`${t("safety.execution_permissions")}：${label}`}
        title={`${t("safety.execution_permissions")}：${label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ic" aria-hidden="true">
          {apv === "yolo"
            ? <i className="polwarn"><StudioIcon name="warning" /></i>
            : <StudioIcon name="shield" />}
        </span>
        <span className={apv === "yolo" ? "lb polrisk" : "lb"} data-display={label}>{label}</span>
        <StudioIcon name="down" className="studio-control-chevron" />
      </button>
      <div className="menu modemenu polmenu composer-menu" role="group" aria-label={t("safety.execution_permissions")} hidden={!open}>
        <div className="studio-policy-head"><b>{t("safety.execution_permissions")}</b><small>{t("common.current_task")}</small></div>
        <div className="studio-policy-primary">
          {confirming && <AllowAllConfirm onGo={allowAll} onCancel={() => setConfirming(false)} />}
          {APPROVALS.map(([value, name, note]) => (
            <div key={value}>
              {value === "yolo" && <div className="studio-policy-risk">{t("common.high_risk")}</div>}
              <button
                className={`studio-permission-option${value === "yolo" ? " studio-permission-yolo" : ""}`}
                data-action="tool-approval.mode"
                data-value={value}
                data-on={apv === value ? "" : undefined}
                data-pending={asking === value ? "" : undefined}
                aria-pressed={apv === value}
                disabled={!!asking}
                onClick={() => apply(value)}
              >
                <span><b>{t(name)}</b><small>{t(note)}</small></span>
                {apv === value && <StudioIcon name="check" className="studio-permission-check" />}
              </button>
            </div>
          ))}
          {refused && <div className="note bad studio-policy-error" role="alert">{refused}</div>}
        </div>
        <div className="studio-policy-note">{t("safety.approvals_decide_when_to_ask")}</div>
        <button className="studio-policy-boundary" data-action="settings.section" data-value="tools:sandbox" onClick={onBoundary} disabled={!onBoundary}>
          <span><b>{t("safety.sandbox_and_runtime_boundary")}</b><small>{t("safety.view_current_isolation_and_network")}</small></span>
          <span aria-hidden="true"><StudioIcon name="chevron" /></span>
        </button>
      </div>
    </div>
  );
}
