// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "./testkit";
import { DeckChips } from "./DeckChips";
import type { JobEntry } from "../port/port";

afterEach(cleanup);

const job = (over: Partial<JobEntry> = {}): JobEntry =>
  ({ id: "j1", label: "pnpm dev", status: "running", startedAt: Date.now(), ...over }) as JobEntry;

const draw = (jobs: JobEntry[]) =>
  render(<DeckChips jobs={jobs} open="" onOpen={vi.fn()} />).container;

// These are readings about the turn, so they live with the turn's other
// readings and open the way those do: the detail is part of the same object,
// not a panel somewhere else that a click has to go and find. Delegates are
// not here — they live in the badge at the top of the window.
describe("the deck readings", () => {
  it("say nothing when nothing is running beside the conversation", () => {
    expect(draw([]).querySelector(".studio-deck-anchor")).toBeNull();
  });

  it("carry their own detail rather than opening something elsewhere", () => {
    const box = draw([job()]);
    const anchor = box.querySelector(".studio-deck-anchor");
    expect(anchor?.querySelector('[data-action="deck.jobs"]')).not.toBeNull();
    // Inside the same anchor, which is what lets hover and focus reach it.
    expect(anchor?.querySelector(".studio-deck-pop")).not.toBeNull();
  });

  it("count only what is live, and read 0 when everything has ended", () => {
    expect(draw([job()]).querySelector('[data-action="deck.jobs"] b')?.textContent).toBe("1");
    const settled = draw([job({ status: "exited" })]);
    expect(settled.querySelector('[data-action="deck.jobs"] b')?.textContent).toBe("1");
    expect(settled.querySelector('[data-action="deck.jobs"] span')?.textContent).toBe("个后台任务 · 都结束了");
    expect(settled.querySelector('[data-action="deck.jobs"]')?.hasAttribute("data-live")).toBe(false);
  });

  it("reads how many jobs are running, then how many failed once none is", () => {
    const running = draw([job(), job({ id: "j2", status: "failed" })]);
    expect(running.querySelector('[data-action="deck.jobs"] span')?.textContent).toBe("个后台任务在跑");
    cleanup();
    const failed = draw([job({ status: "failed" }), job({ id: "j2", status: "failed" }), job({ id: "j3", status: "done" })]);
    const chip = failed.querySelector('[data-action="deck.jobs"]')!;
    expect(chip.querySelector("b")?.textContent).toBe("2");
    expect(chip.querySelector("span")?.textContent).toBe("个后台任务失败了");
    expect(chip.getAttribute("data-failed")).toBe("");
  });
});

describe("the background-job popover", () => {
  const ended = (over: Partial<JobEntry> = {}): JobEntry =>
    ({ id: "e1", kind: "bash", label: "go test ./...", description: "跑第 2 组内核测试", status: "failed", startedAt: 1_000, endedAt: 243_000, exitCode: 1, tail: "FAIL TestCompactKeepsPins (0.31s)", ...over }) as JobEntry;

  it("lists running jobs above ended ones, an ended one with its time, last line and exit status", () => {
    const box = render(<DeckChips jobs={[job({ tail: "compiling module 192 … ok" }), ended()]} open="jobs" onOpen={vi.fn()} />).container;
    const heads = [...box.querySelectorAll(".job-deck-head b")].map((b) => b.textContent);
    expect(heads).toEqual(["在跑 · 1", "已结束 · 1"]);
    const rows = [...box.querySelectorAll(".job-deck-row")];
    expect(rows[0].querySelector(".job-deck-tail")?.textContent).toBe("compiling module 192 … ok");
    expect(rows[1].querySelector(".job-deck-time")?.textContent).toBe("4 分 02 秒 · 失败");
    expect(rows[1].querySelector(".job-deck-exit")?.textContent).toBe("退出 1");
    expect(rows[1].querySelector(".job-deck-tail")?.textContent).toBe("FAIL TestCompactKeepsPins (0.31s)");
  });

  it("clears the ended ones through the pane", () => {
    const onClearJobs = vi.fn();
    const box = render(<DeckChips jobs={[job(), ended(), ended({ id: "e2", status: "done", exitCode: 0 })]} open="jobs" onOpen={vi.fn()} onClearJobs={onClearJobs} />).container;
    (box.querySelector('[data-action="job.clear"]') as HTMLButtonElement).click();
    expect(onClearJobs).toHaveBeenCalledWith(["e1", "e2"]);
  });

  it("stays red for a failure until the list has been opened on it", () => {
    const view = render(<DeckChips jobs={[ended()]} open="" onOpen={vi.fn()} />);
    const chip = () => view.container.querySelector('[data-action="deck.jobs"]')!;
    expect(chip().hasAttribute("data-failed")).toBe(true);
    view.rerender(<DeckChips jobs={[ended()]} open="jobs" onOpen={vi.fn()} />);
    view.rerender(<DeckChips jobs={[ended()]} open="" onOpen={vi.fn()} />);
    expect(chip().hasAttribute("data-failed")).toBe(false);
    expect(chip().querySelector("span")?.textContent).toBe("个后台任务 · 都结束了");
  });
});
