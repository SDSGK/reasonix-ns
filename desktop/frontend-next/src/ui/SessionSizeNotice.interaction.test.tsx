// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./testkit";
import { SessionSizeNotice, sessionReadings } from "./SessionSizeNotice";
import type { ContextBreakdown, SessionUsage } from "../port/port";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const usage = (promptTokens: number): SessionUsage => ({
  requests: 10, promptTokens, completionTokens: 100, cacheHit: 0, cacheMiss: 0, workMs: 0, sources: [],
});

const ctx = (window: number): ContextBreakdown => ({
  used: 1000, window, system: 100, tools: 100, user: 100, reply: 100, output: 100,
  compact_at: window * 0.8, boundary: "", capacity_at: window,
});

describe("how much history a session has made the model read", () => {
  it("counts the readings the ledger and the window make together", () => {
    expect(sessionReadings(usage(800_000), ctx(200_000))).toBe(4);
    expect(sessionReadings(usage(200_000), ctx(200_000))).toBe(1);
    // A window nobody declared, or a session that has read nothing, says
    // nothing: the ratio needs both.
    expect(sessionReadings(usage(800_000), ctx(0))).toBe(0);
    expect(sessionReadings(undefined, ctx(200_000))).toBe(0);
  });
});

describe("the notice that a conversation has grown long", () => {
  it("says nothing while the session still fits in a few readings", () => {
    const { container } = render(<SessionSizeNotice usage={usage(200_000)} ctx={ctx(200_000)} path="/s/1" />);
    expect(container.textContent).toBe("");
  });

  it("says what the session has cost, once", async () => {
    render(<SessionSizeNotice usage={usage(800_000)} ctx={ctx(200_000)} path="/s/1" />);
    const bar = screen.getByRole("status");
    expect(bar.textContent).toContain("这个会话已经很长了");
    expect(bar.textContent).toContain("4");
    await userEvent.click(screen.getByRole("button", { name: "知道了" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not say it again for the same conversation", () => {
    const { container } = render(<SessionSizeNotice usage={usage(800_000)} ctx={ctx(200_000)} path="/s/1" />);
    expect(container.textContent).not.toBe("");
    localStorage.setItem("reasonix:session-size-seen", "/s/1");
    const { container: again } = render(<SessionSizeNotice usage={usage(800_000)} ctx={ctx(200_000)} path="/s/1" />);
    expect(again.textContent).toBe("");
  });
});
