// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./testkit";
import { SidebarTools } from "./SidebarTools";
import shell from "../design/shell.css?raw";

// The toolbar at the foot of the rail opens its menu on a click and closes it
// on a click away. It used to open on a hover, which meant the menu appeared
// under a pointer that had merely passed by, and vanished again when the
// pointer left — so these tests pin the click-only contract down.

const noop = vi.fn();

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

function tools() {
  return render(<SidebarTools wallet="" approval={undefined} online={0} onSettings={noop} onFiles={noop} />);
}

const toggle = () => screen.getByRole("button", { name: "侧栏入口" });
const menu = () => screen.queryByRole("menu", { name: "侧栏入口" });
const bar = () => screen.getByRole("menu", { name: "侧栏入口" });
const entries = () => [...bar().querySelectorAll<HTMLButtonElement>(":scope > button")];
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

it("stays shut when the pointer only passes over the toolbar", async () => {
  tools();
  const root = document.querySelector<HTMLElement>(".studio-tools")!;
  await userEvent.hover(root);
  fireEvent.pointerOver(root, { pointerType: "mouse" });
  await wait(300);
  expect(menu()).toBeNull();
  expect(toggle().getAttribute("aria-expanded")).toBe("false");
});

it("opens on a click of the shortcuts button and closes on the next one", async () => {
  tools();
  await userEvent.click(toggle());
  expect(menu()).not.toBeNull();
  expect(toggle().getAttribute("aria-expanded")).toBe("true");
  await userEvent.click(toggle());
  expect(menu()).toBeNull();
  expect(toggle().getAttribute("aria-expanded")).toBe("false");
});

it("closes on a click away from the toolbar", async () => {
  tools();
  await userEvent.click(toggle());
  expect(menu()).not.toBeNull();
  await userEvent.click(document.body);
  expect(menu()).toBeNull();
});

it("opens from the keyboard and puts the focus on the first or the last entry", async () => {
  tools();
  toggle().focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(entries()[0]).toBe(document.activeElement);
  await userEvent.keyboard("{Escape}");
  expect(menu()).toBeNull();
  expect(document.activeElement).toBe(toggle());
  await userEvent.keyboard("{ArrowUp}");
  const items = entries();
  expect(items.at(-1)).toBe(document.activeElement);
  await userEvent.keyboard("{Escape}");
  expect(menu()).toBeNull();
});

it("keeps a menu that is open from opening again by hover", async () => {
  tools();
  await userEvent.click(toggle());
  const root = document.querySelector<HTMLElement>(".studio-tools")!;
  await userEvent.hover(root);
  await wait(300);
  expect(menu()).not.toBeNull();
});

it("draws the toolbar with a rule on its left edge", () => {
  const rule = /\.studio-tools\s*\{([^}]*)\}/.exec(shell)?.[1] ?? "";
  expect(rule, "no rule for .studio-tools").not.toBe("");
  expect(rule).toMatch(/border-left:\s*1px solid var\(--(hair|border)\)/);
  expect(rule).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(|oklch\(/);
});
