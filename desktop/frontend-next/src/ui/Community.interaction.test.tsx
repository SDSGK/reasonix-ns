// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./testkit";
import { Community } from "./Community";
import { profileUrl } from "./communityLinks";
import contributors from "../data/contributors.json";
import type { AgentPort } from "../port/port";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const portWith = (openExternal = vi.fn(async () => {})) => ({ openExternal }) as unknown as Pick<AgentPort, "openExternal">;

describe("community and contributors", () => {
  it("opens issues through the host", async () => {
    const openExternal = vi.fn(async () => {});
    render(<Community port={portWith(openExternal)} logins={["a"]} />);
    await userEvent.click(screen.getByRole("button", { name: "去 GitHub" }));
    expect(openExternal).toHaveBeenLastCalledWith("https://github.com/SDSGK/reasonix-ns/issues");
  });

  it("says so, with the address, when the host cannot open it", async () => {
    const openExternal = vi.fn(async () => { throw new Error("no browser"); });
    render(<Community port={portWith(openExternal)} logins={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "去 GitHub" }));
    expect((await screen.findByRole("alert")).textContent).toContain("https://github.com/SDSGK/reasonix-ns/issues");
  });

  it("shows no group number, QR code or social handle", () => {
    const { container } = render(<Community port={portWith()} logins={["a"]} />);
    expect(container.textContent).not.toMatch(/1093562660|22703872788|Discord|QQ|抖音/);
    expect(container.querySelector("img")).toBeNull();
  });

  it("lists contributors as links to their exact profiles", async () => {
    const openExternal = vi.fn(async () => {});
    render(<Community port={portWith(openExternal)} logins={["SivanCola", "o-n-e"]} />);
    const link = screen.getByRole("link", { name: "SivanCola" });
    expect(link.getAttribute("href")).toBe("https://github.com/SivanCola");
    await userEvent.click(link);
    expect(openExternal).toHaveBeenLastCalledWith("https://github.com/SivanCola");
    await userEvent.click(screen.getByRole("button", { name: "查看全部贡献者" }));
    expect(openExternal).toHaveBeenLastCalledWith("https://github.com/SDSGK/reasonix-ns/graphs/contributors");
  });

  it("never turns a hostile login into a URL", () => {
    const hostile = ["a/b", 'x"y', "../../evil", "-lead", "trail-", "a--b", "", "x".repeat(40), "https://evil.test"];
    for (const login of hostile) expect(profileUrl(login)).toBeNull();
    expect(profileUrl("A-b1")).toBe("https://github.com/A-b1");
    render(<Community port={portWith()} logins={[...hostile, "good"]} />);
    const people = screen.getByRole("list", { name: "贡献者" });
    expect(within(people).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["https://github.com/good"]);
  });

  it("collapses a long list and expands it on request", async () => {
    const logins = Array.from({ length: 60 }, (_, i) => `user${i}`);
    render(<Community port={portWith()} logins={logins} />);
    const people = screen.getByRole("list", { name: "贡献者" });
    expect(within(people).getAllByRole("link")).toHaveLength(24);
    await userEvent.click(screen.getByRole("button", { name: "显示全部 60 位" }));
    expect(within(people).getAllByRole("link")).toHaveLength(60);
    await userEvent.click(screen.getByRole("button", { name: "收起" }));
    expect(within(people).getAllByRole("link")).toHaveLength(24);
  });

  it("offers no toggle for a short list", () => {
    render(<Community port={portWith()} logins={["a", "b"]} />);
    expect(screen.queryByRole("button", { name: /显示全部/ })).toBeNull();
  });

  it("ships a contributors file whose every entry is a valid login", () => {
    expect(contributors.length).toBeGreaterThan(0);
    for (const login of contributors) expect(profileUrl(login)).not.toBeNull();
    expect(contributors.map((l) => l.toLowerCase())).not.toContain("esengine");
  });
});
