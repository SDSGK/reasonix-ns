// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSubagentNotices } from "./useSubagentNotices";
import type { Task } from "./panels/Agents";

const task = (id: string, running: boolean, children = 0): Task =>
  ({
    t: "tool",
    id,
    running,
    children: Array.from({ length: children }, (_, i) => ({ id: `s${i}` })),
    tool: { name: "task", id: `call-${id}`, readOnly: false },
  }) as unknown as Task;

describe("subagent notices", () => {
  it("renders without crashing on an empty task list", () => {
    function Probe({ tasks }: { tasks: Task[] }) {
      useSubagentNotices(tasks);
      return null;
    }
    const { container } = render(<Probe tasks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders with running delegates without crashing", () => {
    function Probe({ tasks }: { tasks: Task[] }) {
      useSubagentNotices(tasks);
      return null;
    }
    const { container } = render(<Probe tasks={[task("a", true, 3), task("b", false, 1)]} />);
    expect(container.firstChild).toBeNull();
  });
});
