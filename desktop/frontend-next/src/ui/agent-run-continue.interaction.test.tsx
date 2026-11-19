// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "./testkit";
import { AgentRunView } from "./AgentRunView";
import type { AgentPort, HistoryMessage } from "../port/port";
import type { SubagentRun, SubagentTranscript, SubagentTurn } from "../port/subagent";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const run = (over: Partial<SubagentRun> = {}): SubagentRun =>
  ({ ref: "sa_1", name: "audit", kind: "task", model: "deepseek/pro", state: "running", startedAt: 1, updatedAt: 2, ...over });

const say = (content: string, msgIndex: number): HistoryMessage => ({ role: "assistant", content, msgIndex });

const page = (messages: HistoryMessage[], after: number, over: Partial<SubagentTranscript> = {}): SubagentTranscript => ({
  run: run(), messages, after, next: after + messages.length, total: after + messages.length, live: true, ...over,
});

/** A run whose transcript is read page by page, and which can be talked to. */
function speaker(pages: SubagentTranscript[], turn?: SubagentTurn) {
  const calls: number[] = [];
  const sent: [string, string][] = [];
  const port = {
    workspaceImageURL: () => "",
    subagentTranscript: vi.fn(async (_ref: string, after = 0) => {
      calls.push(after);
      return pages.find((p) => p.after === after) ?? pages[pages.length - 1];
    }),
    subagentContinue: vi.fn(async (ref: string, input: string) => {
      sent.push([ref, input]);
      return turn ?? { ref, answer: "done" };
    }),
  } as unknown as AgentPort;
  return { port, calls, sent };
}

describe("talking to a sub-agent from its own view", () => {
  it("sends what was typed to the run it belongs to", async () => {
    const { port, sent } = speaker([page([say("first", 1)], 0, { live: false, run: run({ state: "completed" }) })]);
    render(<AgentRunView port={port} run={{ ref: "sa_1", name: "audit" }} shown />);
    const box = await screen.findByRole("textbox");
    fireEvent.change(box, { target: { value: "now check the failing test" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await act(async () => {});
    expect(sent).toEqual([["sa_1", "now check the failing test"]]);
  });

  it("sends on Enter, and leaves Shift+Enter to the box", async () => {
    const { port, sent } = speaker([page([say("first", 1)], 0, { live: false, run: run({ state: "completed" }) })]);
    render(<AgentRunView port={port} run={{ ref: "sa_1", name: "audit" }} shown />);
    const box = await screen.findByRole("textbox");
    fireEvent.change(box, { target: { value: "keep going" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    await act(async () => {});
    expect(sent).toEqual([]);
    fireEvent.keyDown(box, { key: "Enter" });
    await act(async () => {});
    expect(sent).toEqual([["sa_1", "keep going"]]);
  });

  it("reads the answer back from where the last page ended, not from the start", async () => {
    const { port, calls } = speaker([
      page([say("first", 1)], 0),
      page([say("second", 2)], 1, { live: false, run: run({ state: "completed" }) }),
    ]);
    render(<AgentRunView port={port} run={{ ref: "sa_1", name: "audit" }} shown />);
    await screen.findByText(/second/);
    const before = calls.length;
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "one more thing" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await act(async () => {});
    expect(calls.slice(before)).toEqual([2]);
  });

  it("says why the message did not go, and keeps what was typed", async () => {
    const port = {
      workspaceImageURL: () => "",
      subagentTranscript: vi.fn(async () => page([say("first", 1)], 0, { live: false, run: run({ state: "completed" }) })),
      subagentContinue: vi.fn(async () => { throw new Error("the session is busy"); }),
    } as unknown as AgentPort;
    render(<AgentRunView port={port} run={{ ref: "sa_1", name: "audit" }} shown />);
    const box = await screen.findByRole("textbox");
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect((await screen.findByRole("alert")).textContent).toContain("the session is busy");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("hello");
  });

  it("offers no box to a run that could not be read at all", async () => {
    const port = { workspaceImageURL: () => "", subagentTranscript: vi.fn(async () => { throw new Error("no such run"); }) } as unknown as AgentPort;
    render(<AgentRunView port={port} run={{ ref: "sa_1", name: "audit" }} shown />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
