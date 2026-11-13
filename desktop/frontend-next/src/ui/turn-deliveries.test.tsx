// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TurnDeliveries, deliveriesOf } from "./TurnDeliveries";
import type { Item } from "../state/session";

afterEach(cleanup);

const user = (): Item => ({ t: "user" } as unknown as Item);
const writerTool = (path: string, diff: string, added = 3, removed = 1): Item =>
  ({
    t: "tool",
    tool: { name: "edit_file", readOnly: false, deliveries: [{ path }], diff, added, removed },
  }) as unknown as Item;
const say = (text: string): Item => ({ t: "say", text }) as unknown as Item;

describe("deliveriesOf", () => {
  it("aggregates only the current turn's writer deliveries", () => {
    const items = [user(), writerTool("a.go", "diff-a"), user(), writerTool("b.ts", "diff-b")];
    expect(deliveriesOf(items).map((d) => d.path)).toEqual(["b.ts"]);
  });

  it("keeps the last delivery of one file", () => {
    const items = [user(), writerTool("a.go", "diff-1"), writerTool("a.go", "diff-2")];
    const out = deliveriesOf(items);
    expect(out).toHaveLength(1);
    expect(out[0].diff).toBe("diff-2");
  });

  it("is empty for a turn with no deliveries", () => {
    expect(deliveriesOf([user(), say("done")])).toEqual([]);
    expect(deliveriesOf([])).toEqual([]);
  });
});

describe("the turn deliveries row above the input box", () => {
  it("shows one collapsed line, opens the file list, and the diff on click", () => {
    const items = [user(), writerTool("a.go", "diff-a", 5, 2)];
    const { container } = render(<TurnDeliveries items={items} />);
    expect(container.querySelector(".turndeliver-head")!.textContent).toContain("1 个文件");
    expect(container.querySelector(".turndeliver-diff")).toBeNull();

    fireEvent.click(container.querySelector('[data-action="deliveries.toggle"]')!);
    const file = container.querySelector<HTMLButtonElement>('[data-action="deliveries.view"]')!;
    expect(file?.textContent).toBe("a.go");
    expect(container.textContent).toContain("+5");

    fireEvent.click(file);
    expect(container.querySelector(".turndeliver-diff")).toBeTruthy();

    fireEvent.click(container.querySelector('[data-action="deliveries.toggle"]')!);
    expect(container.querySelector(".turndeliver-diff")).toBeNull();
  });

  it("renders nothing when the turn changed no files", () => {
    const { container } = render(<TurnDeliveries items={[user(), say("done")]} />);
    expect(container.querySelector(".turndeliver")).toBeNull();
  });
});
