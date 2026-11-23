// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import "./testkit";
import { App } from "./App";
import { Welcome } from "./Welcome";
import { MockHub } from "../port/mock_hub";

// A machine that has its provider and has never seen the opening: the cover
// plays over a room that is already there.
function firstLaunchHub() {
  const hub = new MockHub();
  const build = hub.portFor.bind(hub);
  hub.portFor = (rt) => {
    const port = build(rt);
    port.providerSetup = async () => null;
    port.welcomeSeen = async () => false;
    return port;
  };
  return hub;
}

afterEach(cleanup);

describe("the opening leaves by lifting off the room", () => {
  it("draws the room under the cover and uncovers it without a cut", async () => {
    render(<App hub={firstLaunchHub()} />);

    // The cover is up.
    const cover = await waitFor(() => {
      const el = document.querySelector(".oobe");
      if (!el) throw new Error("the cover is not up");
      return el;
    });
    // The room is already there: the cover is over it, not in front of a
    // second one that appears when it goes.
    const room = document.querySelector(".app .cols");
    expect(room).toBeTruthy();
    expect(cover.parentElement?.querySelector(".app .cols")).toBe(room);

    // A key skips the opening.
    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => expect(document.querySelector(".oobe")?.hasAttribute("data-leaving")).toBe(true));
    // The cover is travelling, and the room under it has not been remounted.
    expect(document.querySelector(".oobe")).toBeTruthy();
    expect(document.querySelector(".app .cols")).toBe(room);

    // The travel ends and the cover goes. What is left is the room that was
    // there all along.
    await waitFor(() => expect(document.querySelector(".oobe")).toBeNull(), { timeout: 5000 });
    expect(document.querySelector(".app .cols")).toBe(room);
  });
});

describe("reduced motion", () => {
  it("takes the cover away at once rather than carrying it off", async () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: /prefers-reduced-motion/.test(query),
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      const onDone = vi.fn();
      render(<Welcome variant="short" replay onDone={onDone} />);
      // It ends: the cover does not wait for a travel it will not make.
      await waitFor(() => expect(onDone).toHaveBeenCalled());
      // And it does not travel: it is taken away, not carried off.
      expect(document.querySelector(".oobe")?.hasAttribute("data-leaving") ?? false).toBe(false);
    } finally {
      window.matchMedia = matchMedia;
    }
  });
});
