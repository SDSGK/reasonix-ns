// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import "./testkit";
import { SettingsNav } from "./SettingsNav";
import { leavesOf, type Section } from "./prefsnav";

// The settings column is a tree: a section, and the blocks drawn on it. A
// reader who wants "where do I turn the sandbox off" should not have to know
// which section holds it before they can look, and the number beside a
// section's name only ever said how many rows to scroll past.
afterEach(cleanup);

const values = new Proxy({}, { get: () => "" }) as never;

type Props = ComponentProps<typeof SettingsNav>;

const draw = (at: Section = "session", over: Partial<Props> = {}) =>
  render(
    <SettingsNav
      at={at}
      values={values}
      shown={() => true}
      danger={() => false}
      disabled={false}
      onSelect={() => {}}
      {...over}
    />,
  );

const leaf = (anchor: string) =>
  document.querySelector<HTMLElement>(`.prefs-leaf[data-target="${anchor}"]`);

describe("the settings column as a tree", () => {
  it("carries no number beside a section any more", () => {
    draw("session");
    expect(document.querySelector(".prefs-nav .nv")).toBeNull();
    const row = document.querySelector<HTMLElement>('.prefs-tab[data-value="session"]')!;
    expect(row.querySelectorAll(".nv")).toHaveLength(0);
  });

  it("opens the section being read and folds the rest away", () => {
    draw("session");
    const trees = document.querySelectorAll(".prefs-tree");
    expect(trees).toHaveLength(1);
    expect(leaf("ask-timeout")).not.toBeNull();
    expect(leaf("approval")).toBeNull();
  });

  it("follows the section the screen moves to", () => {
    const { rerender } = draw("session");
    rerender(
      <SettingsNav
        at="tools"
        values={values}
        shown={() => true}
        danger={() => false}
        disabled={false}
        onSelect={() => {}}
      />,
    );
    expect(leaf("approval")).not.toBeNull();
    expect(leaf("ask-timeout")).toBeNull();
  });

  it("lists every block of the section under it", () => {
    draw("session");
    const wanted = leavesOf("session").reduce((n, leaf) => n + 1 + leaf.children.length, 0);
    expect(document.querySelectorAll(".prefs-leaf")).toHaveLength(wanted);
  });

  it("enters the section when the section itself is picked", () => {
    const onSelect = vi.fn();
    draw("session", { onSelect });
    fireEvent.click(document.querySelector('.prefs-tab[data-value="tools"]')!);
    expect(onSelect).toHaveBeenCalledWith("tools");
  });

  it("asks the screen to take the reader to the block that was picked", () => {
    const onAnchor = vi.fn();
    draw("session", { onAnchor });
    fireEvent.click(leaf("ask-timeout")!);
    expect(onAnchor).toHaveBeenCalledWith("session", "ask-timeout");
  });

  it("folds a section away and opens another one", () => {
    draw("session");
    const twist = document.querySelector<HTMLElement>('.prefs-twist[data-value="session"]')!;
    expect(twist.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(twist);
    expect(document.querySelectorAll(".prefs-tree")).toHaveLength(0);
    fireEvent.click(document.querySelector('.prefs-twist[data-value="tools"]')!);
    expect(document.querySelectorAll(".prefs-tree")).toHaveLength(1);
    expect(leaf("approval")).not.toBeNull();
  });

  it("hangs a region under the block that holds it", () => {
    draw("session");
    const region = document.querySelector<HTMLElement>('.prefs-leaf-sub[data-target="persona"]');
    expect(region).not.toBeNull();
    const order = [...document.querySelectorAll(".prefs-leaf")].map((el) => el.getAttribute("data-target"));
    expect(order.indexOf("persona")).toBeGreaterThan(order.indexOf("agent-presets"));
  });

  it("names every action it renders among the ones the registry knows", () => {
    draw("session");
    const actions = new Set(
      [...document.querySelectorAll(".prefs-nav [data-action]")].map((el) => el.getAttribute("data-action")),
    );
    expect([...actions].sort()).toEqual(["settings.nav-toggle", "settings.section"]);
  });
});
