import { MockMcp } from "./mock_mcp";
import { HttpError, type HookCatalog, type HookDryRun, type HookEntry } from "./port";
import type { SubagentRun, SubagentTranscript, SubagentTurn } from "./subagent";
import type { ProcessEntry } from "./process";

// The mock's sub-agent runs: the delegate deck has something to say in mock
// mode too, and a run the reader opens has a transcript to read. The times are
// read fresh each time, so the durations a reader sees are the ones now.
const mockRuns = (): SubagentRun[] => {
  const now = Date.now();
  return [
    { ref: "sa_mock_review", name: "安全面复核", kind: "task", model: "deepseek-v4-pro", state: "completed", parentCall: "tk1", startedAt: now - 96_000, updatedAt: now - 12_000, tokens: 3_240 },
    { ref: "sa_mock_patch", name: "落地退避补丁", kind: "task", model: "deepseek-v4-pro", state: "running", parentCall: "fx1", startedAt: now - 5_000, updatedAt: now, tokens: 1_180 },
    { ref: "sa_mock_tests", name: "测试是否覆盖 401", kind: "task", model: "deepseek-v4-flash", state: "failed", parentCall: "fx1", startedAt: now - 42_000, updatedAt: now - 30_000, tokens: 640 },
  ];
};

// Hooks, and what a dry run of one reports back.
export class MockHook extends MockMcp {
  private hookList: HookEntry[] = [
    { event: "PostToolUse", match: "edit_file|write_file", command: "gofmt -w .", scope: "global", usesMatch: true },
    { event: "PreToolUse", match: "bash", command: "./scripts/guard.sh", scope: "global", blocking: true, usesMatch: true },
  ];

  async stopToolCall(_callId: string): Promise<void> {
    throw new HttpError(409, "no running tool call with this id", { code: "tool_call.not_running" });
  }

  async subagents(): Promise<SubagentRun[]> {
    return mockRuns();
  }

  async processes(): Promise<ProcessEntry[]> {
    return [];
  }

  async subagentTranscript(ref: string): Promise<SubagentTranscript> {
    const run = mockRuns().find((r) => r.ref === ref);
    if (!run) throw new HttpError(404, "no sub-agent run answers to that reference", { code: "subagent.not_found" });
    const messages = [
      { role: "user" as const, content: "只读地过一遍安全面，别改任何文件。", msgIndex: 0 },
      { role: "assistant" as const, content: "看过了：没有新的密钥读写路径，退避补丁不碰凭据存储。", msgIndex: 1 },
    ];
    return { run, messages, after: 0, next: messages.length, total: messages.length, live: run.state === "running" };
  }

  async subagentContinue(_ref: string, _input: string): Promise<SubagentTurn> {
    throw new HttpError(404, "no sub-agent run answers to that reference", { code: "subagent.not_found" });
  }

  async hooks(): Promise<HookCatalog> {
    return {
      hooks: this.hookList.map((h) => ({ ...h })),
      sources: [{ scope: "global", path: "~/.reasonix/settings.json", status: "ok", hookCount: this.hookList.length }],
      events: [
        { name: "PreToolUse", blocking: true, usesMatch: true },
        { name: "PostToolUse", blocking: false, usesMatch: true },
        { name: "PostToolUseFailure", blocking: false, usesMatch: true },
        { name: "PermissionRequest", blocking: false, usesMatch: true },
        { name: "UserPromptSubmit", blocking: true, usesMatch: false },
        { name: "Stop", blocking: false, usesMatch: false },
        { name: "SessionStart", blocking: false, usesMatch: false },
        { name: "Notification", blocking: false, usesMatch: false },
      ],
      projectPath: "~/projects/DeepSeek-Reasonix/.reasonix/settings.json",
      globalPath: "~/.reasonix/settings.json",
    };
  }

  async saveHooks(scope: "user" | "project", hooks: HookEntry[]) {
    this.hookList = hooks.map((h) => ({ ...h, scope: scope === "user" ? "global" : "project" }));
  }

  // Stands in for a real execution: a command mentioning "guard" exits 2 so the
  // blocking verdict is reachable in dev.

  // Stands in for a real execution: a command mentioning "guard" exits 2 so the
  // blocking verdict is reachable in dev.
  async dryRunHook(h: HookEntry): Promise<HookDryRun> {
    const bad = /guard|exit 2/.test(h.command);
    return {
      decision: bad ? "block" : "pass",
      exitCode: bad ? 2 : 0,
      stdout: bad ? "" : "ok",
      stderr: bad ? "refusing: .env is protected" : "",
      durationMs: 120,
      blocks: bad && !!h.blocking,
    };
  }
}
