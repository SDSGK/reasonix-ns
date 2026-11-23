// @vitest-environment jsdom
import "./testkit";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Workspaces } from "./Workspaces";
import { WsMark } from "./WsMark";
import { RailSearch } from "./railsearch";
import { boot, STORAGE, t } from "../i18n";

const KEY = "rx-project-icons";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE, "zh");
  boot();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function Tree({ roots = ["/w"] }: { roots?: string[] }) {
  const [folded, setFolded] = useState(new Set<string>());
  return (
    <RailSearch>
      <Workspaces
        hub={{} as never}
        tree={roots.map((root) => ({
          root,
          name: root === "/w" ? "Project" : "Leaf",
          sessions: root === "/w" ? [{ path: root + "/s", name: "Task", turns: 1 }] : [],
        }))}
        treeRead
        runtimes={[]}
        active=""
        previewLimit={5}
        folded={folded}
        onFold={(root, shut) => setFolded(shut ? new Set([root]) : new Set())}
        reload={async () => {}}
        onOpen={async () => {}}
        onFocus={() => {}}
        onClose={async () => {}}
        liveIds={() => []}
        runs={{}}
        onRename={() => {}}
        onError={() => {}}
        adder={{ add: () => {} } as never}
      />
    </RailSearch>
  );
}

const stored = () => JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, { icon: string; color: string }>;

describe("the two glyphs of a project that opens", () => {
  it("draws a different arrow for each state rather than turning one round", () => {
    const shut = render(<WsMark open={false} />);
    expect(shut.container.querySelector("svg.lucide-chevron-right")).toBeTruthy();
    expect(shut.container.querySelector("svg.lucide-chevron-down")).toBeNull();
    cleanup();

    const open = render(<WsMark open={true} />);
    expect(open.container.querySelector("svg.lucide-chevron-down")).toBeTruthy();
    expect(open.container.querySelector("svg.lucide-chevron-right")).toBeNull();
  });

  it("draws no arrow for a project with nothing under it, but keeps the room it took", () => {
    const leaf = render(<WsMark open={undefined} />);
    const room = leaf.container.querySelector(".ds-chev");
    expect(room).toBeTruthy();
    expect(room?.tagName.toLowerCase()).toBe("span");
    expect(leaf.container.querySelector(".ds-chev svg")).toBeNull();
  });
});

describe("a project in the tree", () => {
  it("shows the folder until the project is given a mark of its own", async () => {
    render(<Tree />);
    const row = document.querySelector(".ds-proj") as HTMLElement;
    expect(row.querySelector("svg.lucide-folder")).toBeTruthy();

    fireEvent.contextMenu(screen.getByText("Project"));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: t("settings.appearance") }));
    await userEvent.click(screen.getByTitle("brain"));

    const marked = document.querySelector(".ds-proj") as HTMLElement;
    expect(marked.querySelector("svg.lucide-brain")).toBeTruthy();
    expect(marked.querySelector("svg.lucide-folder")).toBeNull();
    expect(stored()["/w"]).toEqual({ icon: "brain", color: "default" });
  });

  it("keeps the mark across a restart, because it was written down", async () => {
    render(<Tree />);
    fireEvent.contextMenu(screen.getByText("Project"));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: t("settings.appearance") }));
    await userEvent.click(screen.getByTitle("server"));
    expect(stored()["/w"]?.icon).toBe("server");

    cleanup();
    render(<Tree />);
    expect((document.querySelector(".ds-proj") as HTMLElement).querySelector("svg.lucide-server")).toBeTruthy();
  });

  it("wears the colour it was given, and gives it back on the default button", async () => {
    render(<Tree />);
    fireEvent.contextMenu(screen.getByText("Project"));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: t("settings.appearance") }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Teal" }));

    const worn = document.querySelector(".ds-proj svg.lucide-folder") as SVGElement;
    expect(worn.style.color).toBe("var(--deleg)");

    await userEvent.click(screen.getByRole("menuitemradio", { name: t("common.default") }));
    const plain = document.querySelector(".ds-proj svg.lucide-folder") as SVGElement;
    expect(plain.style.color).toBe("");
    expect(stored()["/w"]).toBeUndefined();
  });

  it("changes the arrow when the project folds, and keeps both glyphs in the file", async () => {
    render(<Tree />);
    const row = document.querySelector(".ds-proj") as HTMLElement;
    expect(row.querySelector("svg.lucide-chevron-down")).toBeTruthy();

    await userEvent.click(screen.getByText("Project"));
    const shut = document.querySelector(".ds-proj") as HTMLElement;
    expect(shut.querySelector("svg.lucide-chevron-right")).toBeTruthy();
    expect(shut.querySelector("svg.lucide-chevron-down")).toBeNull();
  });

  it("opens and shuts the panel again from the same entry", async () => {
    render(<Tree />);
    fireEvent.contextMenu(screen.getByText("Project"));
    const entry = screen.getByRole("menuitemcheckbox", { name: t("settings.appearance") });
    await userEvent.click(entry);
    expect(screen.getAllByRole("menuitemradio").length).toBeGreaterThan(0);
    expect((entry as HTMLButtonElement).getAttribute("aria-checked")).toBe("true");
    await userEvent.click(entry);
    expect(screen.queryAllByRole("menuitemradio")).toHaveLength(0);
    expect((entry as HTMLButtonElement).getAttribute("aria-checked")).toBe("false");
  });

  it("leaves a project with nothing under it without an arrow", () => {
    render(<Tree roots={["/w", "/leaf"]} />);
    const rows = [...document.querySelectorAll(".ds-proj")] as HTMLElement[];
    const leaf = rows.find((row) => row.textContent?.includes("Leaf")) as HTMLElement;
    expect(leaf.querySelector("svg.lucide-chevron-right")).toBeNull();
    expect(leaf.querySelector("svg.lucide-chevron-down")).toBeNull();
    expect(leaf.querySelector(".ds-chev")).toBeTruthy();
  });
});
