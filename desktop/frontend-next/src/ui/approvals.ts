import { t } from "../i18n";
import type { ApprovalMode } from "../port/port";

// One table for every surface that names an approval mode: the composer menu,
// Settings and the shelf. Ordered from strictest to most permissive.
//
// 「不询问」is gone from the list. The kernel maps it to Deny, so every
// operation that needed a permission was quietly not done — a mode that reads
// as "no questions" but delivers no work. The kernel still accepts the value
// from an older configuration, so it keeps a name to show; it is simply not
// something a person can pick any more.
export const APPROVALS: [ApprovalMode, string, string][] = [
  ["ask", "safety.ask", "safety.asks_before_every_action"],
  ["auto", "safety.auto_approve", "safety.low_risk_steps_proceed_writes"],
  ["yolo", "safety.allow_all", "safety.stops_asking_only_for_a"],
];

// What a session saved before the removal still says about itself. The tuple
// is the same shape as APPROVALS', so the name and the note stay in the same
// places: a retired mode read off a different table would answer the wrong
// half of the question.
const RETIRED: Partial<Record<ApprovalMode, [ApprovalMode, string, string]>> = {
  dontAsk: ["dontAsk", "safety.do_not_ask", "safety.no_approval_prompts_anything_needing"],
};

const row = (mode: ApprovalMode | undefined) =>
  APPROVALS.find(([id]) => id === mode) ?? (mode ? RETIRED[mode] : undefined);

export const approvalName = (mode: ApprovalMode | undefined, fallback = "safety.ask"): string =>
  t(row(mode)?.[1] ?? fallback);

export const approvalNote = (mode: ApprovalMode | undefined): string => t(row(mode)?.[2] ?? "");
