// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "./testkit";
import { AgentRunView } from "./AgentRunView";
import { HttpError } from "../port/port";
import type { AgentPort, HistoryMessage } from "../port/port";
import type { SubagentRun, SubagentTranscript } from "../port/subagent";
import css from "../styles/agentrun.css?raw";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const run = (over: Partial<SubagentRun> = {}): SubagentRun =>
  ({ ref: "sa_1", name: "audit", kind: "task", model: "deepseek/pro", state: "running", startedAt: 1, updatedAt: 2, ...over });

const asked = (content: string): HistoryMessage => ({ role: "user", content, msgIndex: 0 });
const said = (content: string, msgIndex: number): HistoryMessage => ({ role: "assistant", content, msgIndex });

const page = (messages: HistoryMessage[], after: number, over: Partial<SubagentTranscript> = {}): SubagentTranscript => ({
  run: run(), messages, after, next: after + messages.length, total: after + messages.length, live: true, ...over,
});

function reader(pages: SubagentTranscript[]) {
  const port = {
    workspaceImageURL: () => "",
    subagentTranscript: vi.fn(async (_ref: string, after = 0) => pages.find((p) => p.after === after) ?? pages[pages.length - 1]),
  } as unknown as AgentPort;
  return { port };
}

describe("the task the main session handed over", () => {
  it("is folded, and opens on demand", async () => {
    const { port } = reader([page([asked("给 export 补测试，只改 tests/"), said("reading the schema", 1)], 0, { live: false, run: run({ state: "completed" }) })]);
    render(<AgentRunView port={port} run={{ ref: "sa_1", name: "audit" }} shown />);
    await screen.findByText(/reading the schema/);
    const card = document.querySelector(".agentrun-task");
    expect(card?.getAttribute("data-expanded")).toBe("false");
    const more = screen.getByRole("button", { name: /展开全部/ });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(more.getAttribute("aria-controls")).toBe(card?.querySelector("p")?.id);

    fireEvent.click(more);
    expect(card?.getAttribute("data-expanded")).toBe("true");
    const less = screen.getByRole("button", { name: /收起/ });
    expect(less.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(less);
    expect(card?.getAttribute("data-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: /展开全部/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the whole task in the card, and scrolls it once it is open", () => {
    // Folded: the card is a few lines tall, not the length of the task.
    expect(css).toContain(".agentrun-task > p { max-height: 5.4em; overflow: hidden; }");
    // Open: the task scrolls inside the card, so the card cannot grow past
    // the height of the pane.
    expect(css).toContain('.agentrun-task[data-expanded="true"] > p { max-height: 40vh; overflow-y: auto; }');
  });

  it("says there is more below the fold only when there is", () => {
    expect(css).toContain('.agentrun-task[data-long="true"][data-expanded="false"] > p');
    expect(css).toContain("mask-image: linear-gradient(to bottom, #000 66%, transparent 100%);");
  });
});

describe("talking to a sub-agent that has ended", () => {
  it("offers no box, and says why", async () => {
    const { port } = reader([page([said("first", 1)], 0, { live: false, run: run({ state: "completed" }) })]);
    render(<AgentRunView port={port} run={{ ref: "sa_1", name: "audit" }} shown />);
    await screen.findByText(/first/);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/已经结束/)).toBeTruthy();
  });

  it("keeps the box for a run that is still working", async () => {
    const { port } = reader([page([said("working", 1)], 0, { live: false, run: run({ state: "running" }) })]);
    render(<AgentRunView port={port} run={{ ref: "sa_1", name: "audit" }} shown />);
    expect(await screen.findByRole("textbox")).toBeTruthy();
  });

  it("says why a message did not go when the run ended under it", async () => {
    const port = {
      workspaceImageURL: () => "",
      subagentTranscript: vi.fn(async () => page([said("working", 1)], 0, { live: false, run: run({ state: "running" }) })),
      subagentContinue: vi.fn(async () => {
        throw new HttpError(409, "that sub-agent run has finished and cannot be talked to", { code: "subagent.not_running" });
      }),
    } as unknown as AgentPort;
    render(<AgentRunView port={port} run={{ ref: "sa_1", name: "audit" }} shown />);
    const box = await screen.findByRole("textbox");
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect((await screen.findByRole("alert")).textContent).toContain("已经不在运行");
  });
});
