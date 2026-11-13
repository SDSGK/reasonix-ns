import { useEffect, useRef } from "react";
import { pushToast } from "../state/toasts";
import { t } from "../i18n";
import { delegateStatus, type DelegateStatus } from "./delegation";
import { nameOf } from "./cards/SubagentGroup";
import type { Task } from "./panels/Agents";

// Five minutes without a new step reads as stuck; one nudge, then silence
// until the delegate moves again or lands.
const idleStepMs = 5 * 60_000;

interface Watched {
  status: DelegateStatus;
  steps: number;
  movedAt: number;
  nudged: boolean;
}

// The delegate rail reports, this hook speaks: a delegate that lands (done,
// failed, refused before starting) or one that has stopped making progress
// raises a toast, so nobody has to watch the rail to know a delegation ended.
// The kernel already hands a finished delegate's result to the model through
// the tool result; this is the human-facing half of the callback.
export function useSubagentNotices(tasks: readonly Task[]): void {
  const last = useRef<Map<string, Watched>>(new Map());
  useEffect(() => {
    const now = Date.now();
    const seen = last.current;
    const next = new Map<string, Watched>();
    for (const task of tasks) {
      const status = delegateStatus(task.running, task.tool);
      const steps = task.children.length;
      const prev = seen.get(task.id);
      const name = nameOf(task);
      if (!prev) {
        next.set(task.id, { status, steps, movedAt: now, nudged: false });
        continue;
      }
      if (prev.status === "running" && status !== "running") {
        const landed =
          status === "done" ? t("子智能体 {name} 已完成", { name })
          : status === "failed" ? t("子智能体 {name} 失败", { name })
          : t("子智能体 {name} 未能启动", { name });
        pushToast(landed);
        next.set(task.id, { status, steps, movedAt: prev.movedAt, nudged: prev.nudged });
        continue;
      }
      if (status !== "running") {
        next.set(task.id, { status, steps, movedAt: prev.movedAt, nudged: prev.nudged });
        continue;
      }
      const moved = steps !== prev.steps;
      const movedAt = moved ? now : prev.movedAt;
      const nudged = moved ? false : prev.nudged;
      if (!moved && !nudged && now - movedAt >= idleStepMs) {
        pushToast(t("子智能体 {name} 已 {min} 分钟没有新进展", { name, min: Math.round((now - movedAt) / 60_000) }));
        next.set(task.id, { status, steps, movedAt, nudged: true });
        continue;
      }
      next.set(task.id, { status, steps, movedAt, nudged });
    }
    last.current = next;
  }, [tasks]);
}
