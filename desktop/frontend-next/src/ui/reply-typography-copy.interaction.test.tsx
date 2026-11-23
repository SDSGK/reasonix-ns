// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./testkit";
import { ToolCard } from "./cards/ToolCard";
import { t } from "../i18n";
import type { StateTool } from "../state/outputcap";

const SHEETS = import.meta.glob(["../styles/app.css", "../design/turn.css"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const app = SHEETS["../styles/app.css"];
const turn = SHEETS["../design/turn.css"];

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const bash = (over: Partial<StateTool> = {}): StateTool => ({ id: "b1", name: "bash", args: '{"command":"go test ./..."}', readOnly: false, ...over });

// A command longer than the row shows: the clipboard is answered from the
// payload, not from the fragment on screen.
const LONG = "go test ./internal/runtime/... -run TestRetryAfterTimeout -count=1 -timeout=30s -v ./pkg/a ./pkg/b";

const clipboard = () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
};

const open = async () => {
  const summary = document.querySelector<HTMLElement>("details.tool-disclosure > summary")!;
  await userEvent.click(summary);
  expect(document.querySelector<HTMLDetailsElement>("details.tool-disclosure")!.open).toBe(true);
};

describe("the reply's type scale", () => {
  it("gives the answer a step of its own, and every size inside it with it", () => {
    expect(app).toMatch(/\.call\[data-k="say"\]\s*\{\s*--read:\s*calc\(var\(--read-base\)\s*\*\s*1\.2\)/);
    // The headings are read off --read too, so they cannot fall behind the
    // paragraph they head.
    expect(app).toMatch(/\.call\[data-k="say"\]\s*\{[^}]*--read:/);
  });

  it("keeps the thought, the call's own words and the delegated rows a step below it", () => {
    expect(app).toMatch(/\.think \.tk\s*\{[^}]*--fs-ui:\s*var\(--fs-meta\)/);
    expect(app).toMatch(/details\.tool-disclosure > \.out \.txt\s*\{\s*font-size:\s*var\(--fs-meta\)/);
    expect(app).toMatch(/\.nest-bd \.hl \.nm\s*\{\s*font-size:\s*var\(--fs-meta\)/);
  });

  it("leaves the reader's own message the size it was", () => {
    expect(turn).toMatch(/\.flow \.call\[data-k="me"\] \.out \.txt\s*\{[^}]*var\(--fs-lead\)/);
    expect(app).not.toMatch(/\.call\[data-k="me"\][^{]*\.out \.txt\s*\{[^}]*font-size/);
  });

  it("bounds the body of an open call and lets it scroll", () => {
    expect(app).toMatch(/details\.tool-disclosure > \.out\s*\{[^}]*max-height:\s*min\(40vh, 560px\)/);
    expect(app).toMatch(/details\.tool-disclosure > \.out\s*\{[^}]*overflow-y:\s*auto/);
  });
});

describe("the command a call ran", () => {
  it("copies the whole command, not the fragment the row shows", async () => {
    const writeText = clipboard();
    render(<ToolCard tool={bash({ args: JSON.stringify({ command: LONG }) })} running={false} />);
    const row = document.querySelector(".hl .arg")!;
    expect(row.textContent!.length).toBeLessThan(LONG.length);
    await userEvent.click(screen.getByRole("button", { name: t("chat.copy_the_command") }));
    expect(writeText).toHaveBeenCalledWith(LONG);
  });

  it("copies without folding the call away", async () => {
    clipboard();
    render(<ToolCard tool={bash({ output: "ok" })} running={false} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: t("chat.copy_the_command") }));
    expect(document.querySelector<HTMLDetailsElement>("details.tool-disclosure")!.open).toBe(true);
  });

  it("says what it did, and undoes the saying", async () => {
    const writeText = clipboard();
    render(<ToolCard tool={bash()} running={false} />);
    const button = screen.getByRole("button", { name: t("chat.copy_the_command") });
    await userEvent.click(button);
    expect(button.getAttribute("data-state")).toBe("done");
    expect(button.getAttribute("aria-label")).toBe(t("common.copied"));
    expect(writeText).toHaveBeenCalledWith("go test ./...");
  });

  it("leaves a call that ran no command without the control", () => {
    render(<ToolCard tool={{ id: "r1", name: "read_file", args: '{"path":"a.ts"}', readOnly: true }} running={false} />);
    expect(screen.queryByRole("button", { name: t("chat.copy_the_command") })).toBeNull();
  });
});

describe("the body of an open call", () => {
  // jsdom has no layout, so the box is measured by hand: the numbers are the
  // ones a scrolled box reports.
  const box = (el: HTMLElement) => {
    const state = { top: 0, height: 1000 };
    Object.defineProperties(el, {
      scrollHeight: { configurable: true, get: () => state.height },
      clientHeight: { configurable: true, get: () => 400 },
      scrollTop: { configurable: true, get: () => state.top, set: (v: number) => { state.top = v; } },
    });
    return state;
  };

  const settle = async () => {
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });
    await act(async () => { await Promise.resolve(); });
  };

  it("opens at the bottom, where the newest line is", async () => {
    render(<ToolCard tool={bash({ output: "line" })} running />);
    const state = box(document.querySelector<HTMLElement>("details.tool-disclosure > .out")!);
    await open();
    await settle();
    expect(state.top).toBe(state.height);
  });

  it("follows the output while it grows, and stops when the reader scrolls away", async () => {
    render(<ToolCard tool={bash({ output: "line" })} running />);
    const body = document.querySelector<HTMLElement>("details.tool-disclosure > .out")!;
    const state = box(body);
    await open();
    await settle();
    expect(state.top).toBe(state.height);

    // The reader scrolls up to read the history: the box stays where they put it.
    state.top = 0;
    await act(async () => { body.dispatchEvent(new Event("scroll")); });
    state.height = 2000;
    await act(async () => { body.appendChild(document.createElement("div")); });
    expect(state.top).toBe(0);

    // Back at the bottom, the box follows again.
    state.top = 1600;
    await act(async () => { body.dispatchEvent(new Event("scroll")); });
    state.height = 2400;
    await act(async () => { body.appendChild(document.createElement("div")); });
    expect(state.top).toBe(2400);
  });
});
