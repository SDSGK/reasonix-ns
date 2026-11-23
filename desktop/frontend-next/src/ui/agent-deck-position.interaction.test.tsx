// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "./testkit";
import { AgentDeckLayer } from "./AgentDeck";
import { setAgentDeckOpen, useAgentDeckOpen } from "./agentRail";
import type { Task } from "./panels/Agents";

const SHEETS = import.meta.glob("../styles/agentrail*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

interface Box { left: number; top: number; width: number; height: number }

// jsdom lays nothing out, so the deck's own box and the badge's are said
// here: the deck measures itself, and the badge is where it hangs from.
const DECK = { width: 360, height: 220 };
let badge: Box = { left: 120, top: 8, width: 160, height: 28 };

const rect = (b: Box): DOMRect => ({
  x: b.left, y: b.top, left: b.left, top: b.top,
  right: b.left + b.width, bottom: b.top + b.height,
  width: b.width, height: b.height, toJSON: () => ({}),
});

const task = (id: string, name: string): Task => ({
  t: "tool",
  id,
  running: false,
  children: [],
  tool: { id, name: "task", readOnly: false, profile: { name } },
});

function Watch() {
  const open = useAgentDeckOpen();
  return <span data-testid="state">{open ? "open" : "closed"}</span>;
}

/** The window as it is on screen: the chrome's badge, and the deck the badge
 *  opens. They are drawn apart because they live apart — the badge belongs to
 *  the chrome, the deck to the pane that owns the tasks. */
function open() {
  setAgentDeckOpen(true);
  const chrome = render(
    <>
      <button type="button" className="agentrail-badge" data-action="agentrail.badge">⏱ 2 个子智能体</button>
      <Watch />
    </>,
  );
  const deck = render(<AgentDeckLayer tasks={[task("t1", "研究助手")]} onOpen={() => {}} />);
  return {
    chrome,
    deck,
    float: () => document.querySelector<HTMLElement>(".agentrail-float")!,
    scrim: () => document.querySelector<HTMLElement>(".agentrail-scrim")!,
  };
}

beforeEach(() => {
  badge = { left: 120, top: 8, width: 160, height: 28 };
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("agentrail-badge")) return rect(badge);
    if (this.classList.contains("agentrail-float")) return rect({ left: 0, top: 0, width: DECK.width, height: DECK.height });
    return rect({ left: 0, top: 0, width: 0, height: 0 });
  });
  setAgentDeckOpen(false);
});

afterEach(() => {
  cleanup();
  setAgentDeckOpen(false);
  vi.restoreAllMocks();
});

describe("where the sub-agent deck opens", () => {
  it("hangs under the badge that opened it, not in a corner of the window", () => {
    const { float } = open();
    // The badge's own left edge, and its bottom plus the gap between them.
    expect(float().style.left).toBe("120px");
    expect(float().style.top).toBe("44px");
    expect(float().dataset.placed).toBe("");
  });

  it("flushes with the badge's right edge when the badge sits on the right of the window", () => {
    badge = { left: 1200, top: 8, width: 160, height: 28 };
    const { float } = open();
    expect(float().style.left).toBe("1000px");
    expect(float().style.top).toBe("44px");
  });

  it("keeps the whole deck inside the window when the badge is at its edge", () => {
    badge = { left: 1400, top: 8, width: 38, height: 28 };
    const { float } = open();
    expect(float().style.left).toBe("1074px");
    expect(parseFloat(float().style.left) + DECK.width).toBeLessThanOrEqual(1440 - 6);
  });

  it("follows the badge when the page scrolls or the window changes shape", () => {
    const { float } = open();
    expect(float().style.left).toBe("120px");
    badge = { left: 300, top: 8, width: 160, height: 28 };
    fireEvent.scroll(window);
    expect(float().style.left).toBe("300px");
    fireEvent.resize(window);
    expect(float().style.left).toBe("300px");
  });
});

describe("how the sub-agent deck is dismissed and read", () => {
  it("closes on a press away from it", () => {
    const { scrim } = open();
    expect(screen.getByTestId("state").textContent).toBe("open");
    fireEvent.click(scrim());
    expect(screen.getByTestId("state").textContent).toBe("closed");
  });

  it("closes on Escape", () => {
    open();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("state").textContent).toBe("closed");
  });

  it("takes the focus when it opens and hands it back to the badge when it closes", () => {
    const { chrome, deck } = open();
    expect(document.activeElement).toBe(document.querySelector(".agent-deck-row"));
    deck.unmount();
    expect(document.activeElement).toBe(chrome.container.querySelector(".agentrail-badge"));
  });
});

describe("the deck's own layer", () => {
  const css = () => SHEETS["../styles/agentrail.css"] ?? "";

  it("is a fixed layer of its own, with the window's floating shadow", () => {
    const float = css().match(/\.agentrail-float \{([^}]*)\}/)?.[1] ?? "";
    expect(float).toMatch(/position:\s*fixed/);
    expect(float).toMatch(/box-shadow:\s*var\(--shadow-float\)/);
    expect(float).toMatch(/background:\s*var\(--float\)/);
    expect(float).toMatch(/border:\s*1px solid var\(--border\)/);
    // The shadow it used to ask for was never a token, so the deck had none.
    expect(css()).not.toMatch(/var\(--shadow\)/);
  });

  it("keeps the scrim as a catch-all that holds no layout of its own", () => {
    const scrim = css().match(/\.agentrail-scrim \{([^}]*)\}/)?.[1] ?? "";
    expect(scrim).toMatch(/position:\s*fixed/);
    expect(scrim).toMatch(/inset:\s*0/);
    // The deck is pinned to the badge, not laid out in a corner of the window.
    expect(scrim).not.toMatch(/display:\s*flex/);
    expect(scrim).not.toMatch(/justify-content/);
  });
});
