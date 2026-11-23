// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "./testkit";
import { Composer } from "./Composer";
import { MockPort } from "../port/mock";
import type { AgentPort, ApprovalMode, ModelEntry, Preset, SessionStatus, WorkspaceGit } from "../port/port";
import { MODEL_MEMORY_KEY } from "./modelMemory";

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

// The workspace's git answer, the way /workspace/git words it. A folder that
// is not a repository says so with repo:false and no absent: there is
// nothing wrong with git there, there is simply no repository.
const repo = (over: Partial<WorkspaceGit> = {}): WorkspaceGit =>
  ({ repo: true, name: "reasonix", branch: "main", detached: false, added: 0, removed: 0, untracked: 0, ...over });
const notARepo = (over: Partial<WorkspaceGit> = {}): WorkspaceGit =>
  ({ repo: false, name: "", branch: "", detached: false, added: 0, removed: 0, untracked: 0, ...over });

const status = (over: Partial<SessionStatus> = {}) =>
  ({
    preset: "balanced" as Preset,
    effort: "auto",
    toolApprovalMode: "ask" as ApprovalMode,
    plan: false,
    modelRef: "alpha/first",
    ...over,
  }) as SessionStatus;

// The catalogue the kernel answers with: alpha/first is the model a new
// session starts on, the other one is merely on offer.
const models: ModelEntry[] = [
  { ref: "alpha/first", provider: "alpha", model: "first", vendor: "alpha.example", default: true },
  { ref: "alpha/second", provider: "alpha", model: "second", vendor: "alpha.example" },
  { ref: "other/plain-v2", provider: "other", model: "plain-v2", vendor: "other.example" },
];

function draw(over: {
  port?: MockPort;
  st?: SessionStatus;
  git?: WorkspaceGit | null;
  fresh?: boolean;
  onSubmit?: (text: string) => Promise<boolean>;
  onChanged?: () => void;
} = {}) {
  const port = over.port ?? new MockPort();
  const onSubmit = over.onSubmit ?? vi.fn(async () => true);
  const onChanged = over.onChanged ?? vi.fn();
  const st = over.st ?? status();
  const view = render(
    <Composer
      port={port as unknown as AgentPort}
      status={st}
      running={false}
      focus={0}
      fresh={over.fresh}
      git={"git" in over ? over.git : repo()}
      onSubmit={onSubmit}
      onChanged={onChanged}
      onError={vi.fn()}
    />,
  );
  const box = view.container.querySelector("textarea") as HTMLTextAreaElement;
  return { ...view, port, onSubmit, onChanged, box };
}

describe("a workspace that is not a repository", () => {
  it("draws no git chip at all", () => {
    const { container } = draw({ git: notARepo() });
    expect(container.querySelector(".studio-branch")).toBeNull();
    expect(container.querySelector("[data-norepo]")).toBeNull();
  });

  it("draws no git chip while the answer is unread", () => {
    const { container } = draw({ git: null });
    expect(container.querySelector(".studio-branch")).toBeNull();
  });

  it("still says so when git refused the folder", () => {
    const { container } = draw({ git: notARepo({ absent: "refused", detail: "dubious ownership" }) });
    const chip = container.querySelector(".studio-branch");
    expect(chip).toBeTruthy();
    expect(chip?.getAttribute("data-absent")).toBe("refused");
  });

  it("still says so when git did not answer", () => {
    const { container } = draw({ git: notARepo({ absent: "unavailable" }) });
    expect(container.querySelector(".studio-branch")?.getAttribute("data-absent")).toBe("unavailable");
  });
});

describe("the prompt glyph", () => {
  it("sits beside the send button and not inside the box", () => {
    const { container } = draw();
    expect(container.querySelector(".fmain .prompt")).toBeNull();
    const glyph = container.querySelector(".go .prompt");
    expect(glyph).toBeTruthy();
    expect(glyph?.getAttribute("aria-hidden")).toBe("true");
  });

  it("comes before the send button, and after the stop button when a turn runs", () => {
    const { container, rerender } = draw();
    const go = container.querySelector(".go") as HTMLElement;
    const order = () => [...go.children].map((el) => el.className);
    expect(order().indexOf("prompt")).toBeLessThan(order().findIndex((c) => c.includes("btn send")));
    rerender(
      <Composer
        port={new MockPort() as unknown as AgentPort}
        status={status()}
        running
        focus={0}
        git={repo()}
        onSubmit={vi.fn(async () => true)}
        onChanged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    const running = container.querySelector(".go") as HTMLElement;
    const runningOrder = [...running.children].map((el) => el.className);
    expect(runningOrder.indexOf("prompt")).toBeGreaterThan(runningOrder.findIndex((c) => c.includes("btn stop")));
    expect(runningOrder.indexOf("prompt")).toBeLessThan(runningOrder.findIndex((c) => c.includes("btn send")));
  });
});

describe("the model a window remembers", () => {
  it("carries the last model into a new window still sitting on the default", async () => {
    localStorage.setItem(MODEL_MEMORY_KEY, "other/plain-v2");
    const port = new MockPort();
    vi.spyOn(port, "models").mockResolvedValue(models);
    const setModel = vi.spyOn(port, "setModel").mockResolvedValue(undefined);
    const { container } = draw({ port, st: status({ modelRef: "alpha/first" }), fresh: true });
    await waitFor(() => expect(setModel).toHaveBeenCalledWith("other/plain-v2"));
    const hint = container.querySelector(".studio-model-hint");
    expect(hint).toBeTruthy();
    // It sits beside the picker, not over the box.
    const group = container.querySelector(".studio-model-group") as HTMLElement;
    expect(hint?.parentElement).toBe(group);
    expect([...group.children].indexOf(hint as Element)).toBeLessThan([...group.children].findIndex((el) => el.querySelector("button.model-picker")));
  });

  it("carries the last model into a session that has no model at all", async () => {
    localStorage.setItem(MODEL_MEMORY_KEY, "other/plain-v2");
    const port = new MockPort();
    vi.spyOn(port, "models").mockResolvedValue(models);
    const setModel = vi.spyOn(port, "setModel").mockResolvedValue(undefined);
    const { container } = draw({ port, st: status({ modelRef: "unconfigured/none" }), fresh: false });
    await waitFor(() => expect(setModel).toHaveBeenCalledWith("other/plain-v2"));
    expect(container.querySelector(".studio-model-hint")).toBeTruthy();
  });

  it("leaves a conversation that has begun on the default alone", async () => {
    localStorage.setItem(MODEL_MEMORY_KEY, "other/plain-v2");
    const port = new MockPort();
    vi.spyOn(port, "models").mockResolvedValue(models);
    const setModel = vi.spyOn(port, "setModel").mockResolvedValue(undefined);
    const { container } = draw({ port, st: status({ modelRef: "alpha/first" }), fresh: false });
    await waitFor(() => expect(port.models).toHaveBeenCalled());
    expect(setModel).not.toHaveBeenCalled();
    expect(container.querySelector(".studio-model-hint")).toBeNull();
  });

  it("leaves a session that chose a model of its own alone", async () => {
    localStorage.setItem(MODEL_MEMORY_KEY, "other/plain-v2");
    const port = new MockPort();
    vi.spyOn(port, "models").mockResolvedValue(models);
    const setModel = vi.spyOn(port, "setModel").mockResolvedValue(undefined);
    const { container } = draw({ port, st: status({ modelRef: "alpha/second" }), fresh: true });
    await waitFor(() => expect(port.models).toHaveBeenCalled());
    expect(setModel).not.toHaveBeenCalled();
    expect(container.querySelector(".studio-model-hint")).toBeNull();
  });

  it("does not choose a model the catalogue no longer offers", async () => {
    localStorage.setItem(MODEL_MEMORY_KEY, "gone/away");
    const port = new MockPort();
    vi.spyOn(port, "models").mockResolvedValue(models);
    const setModel = vi.spyOn(port, "setModel").mockResolvedValue(undefined);
    draw({ port, st: status({ modelRef: "alpha/first" }), fresh: true });
    await waitFor(() => expect(port.models).toHaveBeenCalled());
    expect(setModel).not.toHaveBeenCalled();
  });

  it("says nothing when there is no memory to carry", async () => {
    const port = new MockPort();
    vi.spyOn(port, "models").mockResolvedValue(models);
    const setModel = vi.spyOn(port, "setModel").mockResolvedValue(undefined);
    const { container } = draw({ port, st: status({ modelRef: "alpha/first" }), fresh: true });
    await waitFor(() => expect(port.models).toHaveBeenCalled());
    expect(setModel).not.toHaveBeenCalled();
    expect(container.querySelector(".studio-model-hint")).toBeNull();
  });

  it("the note goes when the model menu is opened", async () => {
    localStorage.setItem(MODEL_MEMORY_KEY, "other/plain-v2");
    const port = new MockPort();
    vi.spyOn(port, "models").mockResolvedValue(models);
    vi.spyOn(port, "setModel").mockResolvedValue(undefined);
    const { container } = draw({ port, st: status({ modelRef: "alpha/first" }), fresh: true });
    await waitFor(() => expect(container.querySelector(".studio-model-hint")).toBeTruthy());
    fireEvent.click(container.querySelector("button.model-picker") as HTMLElement);
    await waitFor(() => expect(container.querySelector(".studio-model-hint")).toBeNull());
  });

  it("the note goes when another model is picked, and the pick is what is remembered", async () => {
    localStorage.setItem(MODEL_MEMORY_KEY, "other/plain-v2");
    const port = new MockPort();
    vi.spyOn(port, "models").mockResolvedValue(models);
    const setModel = vi.spyOn(port, "setModel").mockResolvedValue(undefined);
    const { container } = draw({ port, st: status({ modelRef: "alpha/first" }), fresh: true });
    await waitFor(() => expect(container.querySelector(".studio-model-hint")).toBeTruthy());
    fireEvent.click(container.querySelector("button.model-picker") as HTMLElement);
    const row = (await screen.findAllByRole("menuitem")).find((el) => el.getAttribute("data-value") === "alpha/second");
    fireEvent.click(row as HTMLElement);
    await waitFor(() => expect(setModel).toHaveBeenCalledWith("alpha/second"));
    expect(container.querySelector(".studio-model-hint")).toBeNull();
    expect(localStorage.getItem(MODEL_MEMORY_KEY)).toBe("alpha/second");
  });

  it("the note goes when a message is sent", async () => {
    localStorage.setItem(MODEL_MEMORY_KEY, "other/plain-v2");
    const port = new MockPort();
    vi.spyOn(port, "models").mockResolvedValue(models);
    vi.spyOn(port, "setModel").mockResolvedValue(undefined);
    const onSubmit = vi.fn(async () => true);
    const { container, box } = draw({ port, st: status({ modelRef: "alpha/first" }), fresh: true, onSubmit });
    await waitFor(() => expect(container.querySelector(".studio-model-hint")).toBeTruthy());
    fireEvent.change(box, { target: { value: "开始吧", selectionStart: 3 } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("开始吧"));
    expect(container.querySelector(".studio-model-hint")).toBeNull();
  });
});
