// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "./testkit";
import { MockPort } from "../port/mock";
import type { BrowserTab } from "../port/port";
import { WorkbenchPanel } from "./WorkbenchPanel";
import { Chrome } from "./Chrome";
import { clearAgentCrumb, requestLeaveAgent, setAgentCrumb, useAgentCrumbSurface } from "./agentCrumb";
import type { Surface } from "./workbench_tabs";

const APP = import.meta.glob("../styles/app.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const STUDIO = import.meta.glob("../styles/studio.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const appCss = APP["../styles/app.css"] ?? "";
const studioCss = STUDIO["../styles/studio.css"] ?? "";

afterEach(() => {
  cleanup();
  clearAgentCrumb("sa_9");
});

const pages: BrowserTab[] = [
  { id: "a", target: "ta", title: "Exports audit", url: "https://a.example", active: true },
  { id: "b", target: "tb", title: "Review the schema", url: "https://b.example", active: false },
  { id: "c", target: "tc", title: "Refactor the parser", url: "https://c.example", active: false },
];

function draw(tabs = pages) {
  const port = new MockPort();
  const props = {
    port, tabs, manual: false, shown: true, scheme: "light" as const, changes: [],
    onCloseManual: vi.fn(), onSurfaces: vi.fn(), onExternal: vi.fn(),
  };
  render(<WorkbenchPanel {...props} />);
  return props;
}

// jsdom has no layout, so the strip is told how wide it is and how much of
// the row waits beyond it.
function size(strip: HTMLElement, room: number, shown: number) {
  Object.defineProperty(strip, "clientWidth", { value: room, configurable: true });
  Object.defineProperty(strip, "scrollWidth", { value: shown, configurable: true });
}
const strip = () => document.querySelector<HTMLElement>(".workbench-tablist")!;

describe("the workbench tab strip", () => {
  it("takes a trackpad's sideways swipe and keeps the page from scrolling under it", () => {
    draw();
    const el = strip();
    size(el, 400, 900);
    const swipe = new WheelEvent("wheel", { deltaX: 120, bubbles: true, cancelable: true });
    el.dispatchEvent(swipe);
    expect(swipe.defaultPrevented).toBe(true);
    expect(el.scrollLeft).toBe(120);
  });

  it("still reads a vertical wheel as a sideways scroll", () => {
    draw();
    const el = strip();
    size(el, 400, 900);
    const wheel = new WheelEvent("wheel", { deltaY: 60, bubbles: true, cancelable: true });
    el.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(el.scrollLeft).toBe(60);
  });

  it("leaves the gesture to the page when the strip has nothing to scroll", () => {
    draw();
    const el = strip();
    size(el, 400, 400);
    const swipe = new WheelEvent("wheel", { deltaX: 120, bubbles: true, cancelable: true });
    el.dispatchEvent(swipe);
    expect(swipe.defaultPrevented).toBe(false);
    expect(el.scrollLeft).toBe(0);
  });

  it("narrows the tabs when they no longer fit, and keeps the first four characters", () => {
    draw();
    const el = strip();
    size(el, 300, 900);
    for (const name of document.querySelectorAll<HTMLElement>(".workbench-tab-name")) {
      Object.defineProperty(name, "scrollWidth", { value: 200, configurable: true });
    }
    act(() => { window.dispatchEvent(new Event("resize")); });
    const tabs = [...document.querySelectorAll<HTMLElement>(".workbench-tab[data-key]")];
    expect(tabs).toHaveLength(3);
    for (const tab of tabs) {
      expect(tab.getAttribute("data-narrow")).toBe("");
      expect(tab.style.width).toBe("98px");
    }
    // The whole name stays in the tree; the tab shows the first four
    // characters, so two neighbours can still be told apart.
    expect([...document.querySelectorAll(".workbench-tab-short")].map((n) => n.textContent)).toEqual(["Expo", "Revi", "Refa"]);
    expect([...document.querySelectorAll(".workbench-tab-name")].map((n) => n.textContent)).toEqual(["Exports audit", "Review the schema", "Refactor the parser"]);
    expect(tabs[1]!.querySelector(".workbench-tab-name")!.textContent).toBe("Review the schema");
  });

  it("leaves the tabs their own width while they all fit", () => {
    draw();
    const el = strip();
    size(el, 900, 900);
    for (const name of document.querySelectorAll<HTMLElement>(".workbench-tab-name")) {
      Object.defineProperty(name, "scrollWidth", { value: 200, configurable: true });
    }
    act(() => { window.dispatchEvent(new Event("resize")); });
    for (const tab of document.querySelectorAll<HTMLElement>(".workbench-tab[data-key]")) {
      expect(tab.getAttribute("data-narrow")).toBeNull();
      expect(tab.style.width).toBe("");
    }
  });

  it("lets a tab narrow to sixty pixels and keeps the short title for it", () => {
    const tab = studioCss.match(/\.workbench-tab \{([^}]*)\}/)?.[1] ?? "";
    expect(tab).toMatch(/min-width:\s*60px/);
    expect(studioCss).toMatch(/\.workbench-tab \.workbench-tab-short \{[^}]*display:\s*block/);
    expect(studioCss).toMatch(/\.workbench-tab\[data-narrow\] \.workbench-tab-name \{[^}]*position:\s*absolute/);
  });
});

describe("the breadcrumb's way back", () => {
  const manual: Surface = { kind: "manual", id: "b1" };
  const agent = (ref: string): Surface => ({ kind: "agent", ref, name: "audit" });

  function Harness({ active, surfaces }: { active: Surface; surfaces: Surface[] }) {
    useAgentCrumbSurface(active, true, {
      close: (targets) => { closed.push(targets); },
      surfaces,
      select: (key) => { picked.push(key); },
    });
    return null;
  }
  let closed: Surface[][] = [];
  let picked: string[] = [];

  it("closes the sub-agent's tab and takes the reader back to the main conversation", () => {
    closed = [];
    picked = [];
    const run = agent("sa_1");
    render(<Harness active={run} surfaces={[manual, run]} />);
    act(() => { requestLeaveAgent("sa_1"); });
    expect(closed).toEqual([[run]]);
    expect(picked).toEqual(["manual:b1"]);
  });

  it("closes only the tab when the pane holds no main conversation", () => {
    closed = [];
    picked = [];
    const run = agent("sa_2");
    render(<Harness active={run} surfaces={[run]} />);
    act(() => { requestLeaveAgent("sa_2"); });
    expect(closed).toEqual([[run]]);
    expect(picked).toEqual([]);
  });
});

describe("the breadcrumb's agent", () => {
  it("shows the agent's mark beside its name", () => {
    setAgentCrumb({ ref: "sa_9", name: "audit" });
    render(
      <Chrome
        port={null}
        workspace={null}
        status={{ workspaceRoot: "/tmp/proj", sessionPath: "/tmp/proj/s.jsonl" } as never}
        title="给 export 补测试"
        steer={0}
        account={null}
        theme="light"
        onTheme={() => {}}
        onFind={() => {}}
        view="flow" rows={0} surfaces={0} onView={() => {}}
        onError={() => {}}
      />,
    );
    const crumb = document.querySelector<HTMLElement>(".crumb-agent")!;
    expect(crumb.querySelector(".agent-avatar")).toBeTruthy();
    expect(crumb.textContent).toContain("audit");
  });

  it("holds the mark and the name on one line", () => {
    const rule = appCss.match(/\.crumb \.crumb-agent \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/display:\s*inline-flex/);
    expect(rule).toMatch(/align-items:\s*center/);
    expect(rule).toMatch(/min-width:\s*0/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
    expect(appCss).toMatch(/\.crumb \.crumb-agent-name \{[^}]*text-overflow:\s*ellipsis/);
  });
});
