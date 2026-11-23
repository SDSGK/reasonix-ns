// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./testkit";
import { Policy } from "./Policy";
import type { AgentPort, SandboxSettings, SessionStatus } from "../port/port";

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
});

const STATUS = { preset: "balanced", effort: "medium", toolApprovalMode: "ask" } as SessionStatus;

const BOX: SandboxSettings = {
  bash: "enforce",
  network: true,
  workspaceRoot: "/work",
  allowWrite: [],
  protectChangedFiles: true,
  effectiveWriteRoots: ["/work"],
  effectiveBash: "enforce",
  available: true,
  platform: "darwin",
  path: "/Users/you/.reasonix/config.toml",
};

function draw(calls: Partial<AgentPort> = {}) {
  const onChanged = vi.fn();
  const setApprovalMode = vi.fn(async () => {});
  // The port answers with what it holds, so a saved sandbox is the one the
  // next read returns — a mock that always answers "enforce" would hide the
  // very thing this test is about.
  let box = BOX;
  const sandbox = vi.fn(async () => box);
  const saveSandbox = vi.fn(async (s: SandboxSettings) => {
    box = s;
    return s;
  });
  const port = {
    setApprovalMode,
    sandbox,
    saveSandbox,
    ...calls,
  } as unknown as AgentPort;
  const view = render(<Policy port={port} status={STATUS} onChanged={onChanged} />);
  const open = () => userEvent.click(screen.getByRole("button", { name: "执行权限：询问" }));
  const option = (name: string) =>
    within(screen.getByRole("group", { name: "执行权限" })).getByRole("button", { name: new RegExp(`^${name}`) });
  const confirm = () => screen.getByRole("alertdialog");
  return { ...view, port, onChanged, setApprovalMode, sandbox, saveSandbox, open, option, confirm };
}

describe("the allow-all choice", () => {
  it("asks before it takes the sandbox down", async () => {
    const { open, option, confirm, setApprovalMode } = draw();
    await open();
    await userEvent.click(option("全部放行"));
    expect(confirm()).toBeTruthy();
    // The question names what the choice reaches: the commands leave the jail,
    // and the level they leave is one this machine shares with every project.
    expect(confirm().textContent).toContain("全局设置");
    expect(setApprovalMode).not.toHaveBeenCalled();
  });

  it("puts the question away when another level is chosen instead", async () => {
    const { open, option, queryByRole, setApprovalMode } = draw();
    await open();
    await userEvent.click(option("全部放行"));
    expect(queryByRole("alertdialog")).toBeTruthy();
    await userEvent.click(option("询问"));
    await waitFor(() => expect(setApprovalMode).toHaveBeenCalledWith("ask"));
    expect(queryByRole("alertdialog")).toBeNull();
  });

  it("does nothing when the question is declined", async () => {
    const { open, option, setApprovalMode, saveSandbox, queryByRole } = draw();
    await open();
    await userEvent.click(option("全部放行"));
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(queryByRole("alertdialog")).toBeNull();
    expect(setApprovalMode).not.toHaveBeenCalled();
    expect(saveSandbox).not.toHaveBeenCalled();
  });

  it("waives the approvals and opens the sandbox once confirmed", async () => {
    const { open, option, setApprovalMode, saveSandbox } = draw();
    await open();
    await userEvent.click(option("全部放行"));
    await userEvent.click(screen.getByRole("button", { name: "全部放行", hidden: true }));
    await waitFor(() => expect(setApprovalMode).toHaveBeenCalledWith("yolo"));
    expect(saveSandbox).toHaveBeenCalledWith({ ...BOX, bash: "off" });
  });

  it("puts the sandbox back when the mode is left", async () => {
    const { open, option, setApprovalMode, saveSandbox } = draw();
    await open();
    await userEvent.click(option("全部放行"));
    await userEvent.click(screen.getByRole("button", { name: "全部放行", hidden: true }));
    await waitFor(() => expect(saveSandbox).toHaveBeenCalledWith({ ...BOX, bash: "off" }));
    setApprovalMode.mockClear();
    saveSandbox.mockClear();
    await userEvent.click(option("询问"));
    await waitFor(() => expect(setApprovalMode).toHaveBeenCalledWith("ask"));
    expect(saveSandbox).toHaveBeenCalledWith({ ...BOX, bash: "enforce" });
  });

  it("leaves a sandbox it did not open alone", async () => {
    const { open, option, setApprovalMode, saveSandbox } = draw({
      sandbox: vi.fn(async () => ({ ...BOX, bash: "off", effectiveBash: "off" })),
    });
    await open();
    await userEvent.click(option("全部放行"));
    await userEvent.click(screen.getByRole("button", { name: "全部放行", hidden: true }));
    await waitFor(() => expect(setApprovalMode).toHaveBeenCalledWith("yolo"));
    saveSandbox.mockClear();
    await userEvent.click(option("询问"));
    await waitFor(() => expect(setApprovalMode).toHaveBeenCalledWith("ask"));
    expect(saveSandbox).not.toHaveBeenCalled();
  });

  it("waives the approvals even when the sandbox refuses to open", async () => {
    const saveSandbox = vi.fn(async () => {
      throw new Error("the sandbox refuses");
    });
    const { open, option, setApprovalMode } = draw({ saveSandbox } as never);
    await open();
    await userEvent.click(option("全部放行"));
    await userEvent.click(screen.getByRole("button", { name: "全部放行", hidden: true }));
    await waitFor(() => expect(setApprovalMode).toHaveBeenCalledWith("yolo"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("the sandbox refuses"));
  });

  it("asks again even when the sandbox cannot be put back", async () => {
    const { open, option, setApprovalMode, saveSandbox } = draw();
    await open();
    await userEvent.click(option("全部放行"));
    await userEvent.click(screen.getByRole("button", { name: "全部放行", hidden: true }));
    await waitFor(() => expect(setApprovalMode).toHaveBeenCalledWith("yolo"));
    saveSandbox.mockRejectedValueOnce(new Error("the sandbox refuses"));
    await userEvent.click(option("询问"));
    await waitFor(() => expect(setApprovalMode).toHaveBeenCalledWith("ask"));
    expect(screen.getByRole("alert").textContent).toContain("the sandbox refuses");
  });

  it("keeps the level it remembered when the current one cannot be read", async () => {
    let reads = 0;
    const sandbox = vi.fn(async () => {
      reads += 1;
      if (reads === 2) throw new Error("the sandbox cannot be read");
      return reads === 1 ? BOX : { ...BOX, bash: "off" };
    });
    const { open, option, setApprovalMode, saveSandbox } = draw({ sandbox } as never);
    await open();
    await userEvent.click(option("全部放行"));
    await userEvent.click(screen.getByRole("button", { name: "全部放行", hidden: true }));
    await waitFor(() => expect(setApprovalMode).toHaveBeenCalledWith("yolo"));
    saveSandbox.mockClear();
    // The read fails, so nothing is written and the remembered level stays.
    await userEvent.click(option("询问"));
    await waitFor(() => expect(setApprovalMode).toHaveBeenCalledWith("ask"));
    expect(saveSandbox).not.toHaveBeenCalled();
    // The next attempt reads the sandbox again and puts that level back.
    await userEvent.click(option("全部放行"));
    await userEvent.click(screen.getByRole("button", { name: "全部放行", hidden: true }));
    await waitFor(() => expect(setApprovalMode).toHaveBeenCalledWith("yolo"));
    saveSandbox.mockClear();
    await userEvent.click(option("询问"));
    await waitFor(() => expect(setApprovalMode).toHaveBeenCalledWith("ask"));
    expect(saveSandbox).toHaveBeenCalledWith({ ...BOX, bash: "enforce" });
  });
});
