// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import "./testkit";
import { Pane } from "./Pane";
import { MockPort } from "../port/mock";
import type { RuntimeView } from "../port/hub";
import { HttpError } from "../port/http_error";
import { host } from "../port/host";
import { boot, STORAGE } from "../i18n";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

// A reply names a file by its name inside the folder the link was resolved
// against — the conversation's workspace. The kernel resolves a bare name
// against the workspace it holds, so the folder has to travel with the read:
// otherwise the name points at the wrong place and the workbench answers
// "the file is gone" for a file the reply's own tooltip points at.
async function mount(read: (path: string, root?: string) => Promise<unknown>) {
  localStorage.setItem(STORAGE, "zh"); boot();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const port = new MockPort();
  const status = await port.status();
  vi.spyOn(port, "status").mockResolvedValue({ ...status, workspaceRoot: "/work" });
  vi.spyOn(port, "history").mockResolvedValue([{ role: "user", content: "Create a report" }, { role: "assistant", content: "[Report](/work/docs/report.md)" }]);
  const asked = vi.spyOn(port, "workspaceFile").mockImplementation(read as never);
  vi.spyOn(port, "revealInFileManager").mockResolvedValue();
  vi.spyOn(port, "openFile").mockResolvedValue();
  vi.spyOn(port, "opensFiles").mockReturnValue(true);
  vi.spyOn(port, "revealsFiles").mockReturnValue(true);
  vi.spyOn(host(), "describe").mockResolvedValue({ ...await host().describe(), platform: "darwin" });
  function Harness() {
    const [manualBrowser, onManualBrowser] = useState(false);
    return <Pane port={port} rt={{ id: "p1", root: "/work", name: "work" } as RuntimeView}
      title="work" active visible sideHost={null} side={false} onFocus={() => {}} onReport={() => {}} onSessionChanged={() => {}}
      pulse={0} findPulse={0} onSettings={() => {}} needsProject={false} onOpenProject={() => {}} onKeepHere={() => {}}
      theme="dark" dockW={560} dockMax={880} onDockW={() => {}} manualBrowser={manualBrowser} onManualBrowser={onManualBrowser} />;
  }
  await act(async () => { render(<Harness />); });
  await screen.findByText("Report");
  return { port, asked };
}

it("opens a reply's link in the workbench, asking the kernel with the folder the name was resolved against", async () => {
  const { asked } = await mount(async (path: string, root?: string) => ({ path, content: "# Generated report", revision: "1", root, readOnly: false }));
  fireEvent.click(screen.getByText("Report"));
  await screen.findByRole("heading", { name: "Generated report" });
  expect(asked).toHaveBeenCalledWith("docs/report.md", "/work");
  expect(screen.queryByText("文件已不在原处")).toBeNull();
});

it("reads the file in the workspace itself when the kernel holds no such folder", async () => {
  const { asked } = await mount(async (path: string, root?: string) => {
    if (root) throw new HttpError(403, "not granted", { code: "workspace.root_not_granted" }, true);
    return { path, content: "# Generated report", revision: "1", readOnly: false };
  });
  fireEvent.click(screen.getByText("Report"));
  await screen.findByRole("heading", { name: "Generated report" });
  expect(asked).toHaveBeenCalledWith("docs/report.md", "/work");
  expect(asked).toHaveBeenCalledWith("docs/report.md");
  expect(screen.queryByText("文件已不在原处")).toBeNull();
});

it("still says the file is gone when it is not there at all", async () => {
  const { asked } = await mount(async () => {
    throw new HttpError(404, "missing", { code: "workspace.file_missing" }, true);
  });
  fireEvent.click(screen.getByText("Report"));
  await waitFor(() => expect((screen.getByRole("alert")).textContent).toContain("文件已不在原处"));
  expect(asked).toHaveBeenCalled();
});
