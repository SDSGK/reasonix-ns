// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "./testkit";
import { AgentDeckLayer } from "./AgentDeck";
import { setAgentDeckOpen, setSubagentRuns, useAgentDeckOpen } from "./agentRail";
import { labelOf } from "./workbench_tabs";
import { useAgentTabs, type AgentRequest } from "./useAgentTabs";
import type { Task } from "./panels/Agents";
import type { SubagentRun } from "../port/subagent";

// A dispatch and the runs it opened: the deck's rows are the dispatch and, under
// it, the sub-agents themselves.
const task = (id: string, name: string, call: string): Task => ({
  t: "tool",
  id,
  running: false,
  children: [],
  tool: { id: call, name: "task", readOnly: false, profile: { name } },
});

const run = (over: Partial<SubagentRun> = {}): SubagentRun => ({
  ref: "sa_1",
  name: "研究助手",
  kind: "task",
  model: "deepseek/pro",
  state: "completed",
  parentCall: "call_a",
  startedAt: 1_000,
  updatedAt: 6_000,
  tokens: 4_321,
  ...over,
});

function Watch() {
  const open = useAgentDeckOpen();
  return <span data-testid="state">{open ? "open" : "closed"}</span>;
}

/** The window as it is on screen: the chrome's badge, and the deck the badge
 *  opens. */
function openDeck(onOpen = vi.fn(), onOpenRun = vi.fn()) {
  setAgentDeckOpen(true);
  render(
    <>
      <button type="button" className="agentrail-badge" data-action="agentrail.badge">⏱ 2 个子智能体</button>
      <Watch />
    </>,
  );
  render(<AgentDeckLayer tasks={[task("t1", "研究组", "call_a")]} onOpen={onOpen} onOpenRun={onOpenRun} />);
  return { onOpen, onOpenRun };
}

const row = (name: string) => screen.getByRole("button", { name: new RegExp(name) });

beforeEach(() => {
  setAgentDeckOpen(false);
  setSubagentRuns([]);
});

afterEach(() => {
  cleanup();
  setAgentDeckOpen(false);
  setSubagentRuns([]);
  vi.useRealTimers();
});

describe("the deck's own detail: which sub-agent is which", () => {
  it("names every sub-agent of a dispatch, with where it stands and what it weighed", () => {
    setSubagentRuns([
      run({ ref: "sa_1", name: "研究助手", state: "completed" }),
      run({ ref: "sa_2", name: "审查助手", state: "failed", updatedAt: 3_000, tokens: 900 }),
    ]);
    openDeck();

    const done = row("研究助手");
    expect(done.textContent).toContain("已完成");
    expect(done.textContent).toContain("5s");
    expect(done.textContent).toContain("4.3k tok");

    const failed = row("审查助手");
    expect(failed.textContent).toContain("失败");
    expect(failed.textContent).toContain("2s");
    expect(failed.textContent).toContain("900 tok");
  });

  it("tells a finished run from a running one at a glance", () => {
    setSubagentRuns([
      run({ ref: "sa_1", name: "研究助手", state: "completed" }),
      run({ ref: "sa_2", name: "审查助手", state: "running", startedAt: Date.now() - 4_000, updatedAt: Date.now() }),
    ]);
    openDeck();

    expect(row("研究助手").getAttribute("data-status")).toBe("done");
    expect(row("审查助手").getAttribute("data-status")).toBe("running");
    expect(row("审查助手").textContent).toContain("运行中");
  });

  it("counts the seconds of a running sub-agent as they pass", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const started = Date.now() - 3_000;
    setSubagentRuns([run({ ref: "sa_2", name: "审查助手", state: "running", startedAt: started, updatedAt: started })]);
    openDeck();

    expect(row("审查助手").textContent).toContain("3s");
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(row("审查助手").textContent).toContain("5s");
  });

  it("counts the sub-agents the kernel named, not the ones a dispatch declared", () => {
    setSubagentRuns([
      run({ ref: "sa_1", name: "研究助手" }),
      run({ ref: "sa_2", name: "审查助手" }),
      run({ ref: "sa_3", name: "记录助手" }),
    ]);
    openDeck();
    expect(document.querySelector(".agent-deck-head > span")?.textContent).toContain("共 3");
    expect(document.querySelectorAll(".agent-deck-row")).toHaveLength(4);
  });
});

describe("the deck closing when a run is opened", () => {
  it("closes when a sub-agent is picked, and asks for that run", () => {
    setSubagentRuns([run({ ref: "sa_1", name: "研究助手" })]);
    const { onOpenRun } = openDeck();

    fireEvent.click(row("研究助手"));

    expect(screen.getByTestId("state").textContent).toBe("closed");
    expect(onOpenRun).toHaveBeenCalledWith("sa_1");
  });

  it("closes when the dispatch itself is picked", () => {
    setSubagentRuns([run({ ref: "sa_1", name: "研究助手" })]);
    const { onOpen } = openDeck();

    fireEvent.click(row("研究组"));

    expect(screen.getByTestId("state").textContent).toBe("closed");
    expect(onOpen).toHaveBeenCalledWith("t1");
  });

  it("closes even when the kernel cannot list the run", () => {
    setSubagentRuns([run({ ref: "sa_1", name: "研究助手" })]);
    const { onOpenRun } = openDeck();

    fireEvent.click(row("研究助手"));

    expect(screen.getByTestId("state").textContent).toBe("closed");
    expect(onOpenRun).toHaveBeenCalledWith("sa_1");
  });
});

describe("the workbench's tab of a sub-agent", () => {
  it("says where the run stands, so the reader need not open the tab", () => {
    expect(labelOf({ kind: "agent", ref: "sa_1", name: "audit" }, {})).toBe("audit");
    expect(labelOf({ kind: "agent", ref: "sa_1", name: "audit", state: "running" }, {})).toContain("运行中");
    expect(labelOf({ kind: "agent", ref: "sa_1", name: "audit", state: "completed" }, {})).toContain("已完成");
    expect(labelOf({ kind: "agent", ref: "sa_1", name: "audit", state: "failed" }, {})).toContain("失败");
  });

  it("follows the kernel's record while the tab is open", () => {
    const request: AgentRequest = { runs: [{ ref: "sa_1", name: "audit", state: "running" }] };
    function Tabs() {
      const { agents } = useAgentTabs(request, () => {}, () => {});
      return <span data-testid="tabs">{agents.map((a) => (a.kind === "agent" ? a.state : "")).join(",")}</span>;
    }
    render(<Tabs />);
    expect(screen.getByTestId("tabs").textContent).toBe("running");

    act(() => { setSubagentRuns([run({ ref: "sa_1", name: "audit", state: "completed" })]); });

    expect(screen.getByTestId("tabs").textContent).toBe("completed");
  });
});
