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
  it("shows running delegates first, then recent settled ones", () => {
    const tasks = [task("s1", false), task("r1", true, 65_000), task("s2", false), task("r2", true)];
    const { container } = render(<AgentRailBar tasks={tasks} onOpen={vi.fn()} />);
    const chips = container.querySelectorAll(".agentrail-chip");
    expect(chips).toHaveLength(4); // a replayed session's finished delegates stay visible
    expect(chips[0].getAttribute("data-status")).toBe("running");
    expect(chips[1].getAttribute("data-status")).toBe("running");
    expect(container.querySelector('[data-status="settled"]')).toBeTruthy();
    expect(container.querySelector(".agentrail-pulse, [data-status='running']")).toBeTruthy();
  });

  it("caps the rail once running delegates fill it", () => {
    const tasks = Array.from({ length: 10 }, (_, i) => task(`r${i}`, true));
    const { container } = render(<AgentRailBar tasks={tasks} onOpen={vi.fn()} />);
    expect(container.querySelectorAll(".agentrail-chip")).toHaveLength(8);
  });

  it("renders nothing when the session has no delegates", () => {
    const { container } = render(<AgentRailBar tasks={[]} onOpen={vi.fn()} />);
    expect(container.querySelector(".agentrail")).toBeNull();
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
