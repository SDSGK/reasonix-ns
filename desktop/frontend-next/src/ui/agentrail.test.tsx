// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentRailBar } from "./AgentRailBar";
import type { Task } from "./panels/Agents";

afterEach(cleanup);

const task = (id: string, running: boolean, durationMs?: number): Task =>
  ({
    t: "tool",
    id,
    running,
    children: [],
    tool: { name: "task", id: `call-${id}`, readOnly: false, durationMs },
  }) as unknown as Task;

describe("the delegate rail at the top of the conversation", () => {
  it("shows one chip per running delegate and nothing when idle", () => {
    const { container } = render(<AgentRailBar tasks={[task("a", true, 65_000), task("b", false)]} onOpen={vi.fn()} />);
    const chips = container.querySelectorAll(".agentrail-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain("1m"); // the elapsed time stays on the chip

    const idle = render(<AgentRailBar tasks={[task("b", false)]} onOpen={vi.fn()} />);
    expect(idle.container.querySelector(".agentrail")).toBeNull();
  });

  it("opens the clicked delegate's run", () => {
    const onOpen = vi.fn();
    const { container } = render(<AgentRailBar tasks={[task("a", true), task("b", true)]} onOpen={onOpen} />);
    const chips = container.querySelectorAll<HTMLButtonElement>(".agentrail-chip");
    expect(chips).toHaveLength(2);
    fireEvent.click(chips[1]);
    expect(onOpen).toHaveBeenCalledWith("b");
  });
});
