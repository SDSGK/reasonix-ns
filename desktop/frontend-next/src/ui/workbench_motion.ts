import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { listenAction } from "./listen";
import { fitTabs, TAB_CHROME, TAB_MIN_WIDTH, TAB_NARROW_WIDTH } from "./workbench_tabs";

const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Tabs that appeared after the strip was first drawn, for as long as they take
 *  to come in. A tab drawn with the strip did not just open, so it does not move. */
export function useEnteringTabs(keys: string[]): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null);
  const [entering, setEntering] = useState<ReadonlySet<string>>(() => new Set());
  const joined = keys.join("\n");
  useEffect(() => {
    const now = new Set(joined ? joined.split("\n") : []);
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    const fresh = [...now].filter((k) => !before.has(k));
    if (!fresh.length) return;
    setEntering(new Set(fresh));
    const id = setTimeout(() => setEntering(new Set()), 220);
    return () => clearTimeout(id);
  }, [joined]);
  return entering;
}

/** Narrows a closing tab to nothing before it is removed; at once when motion is reduced. */
export function leave(el: Element | null, then: () => void) {
  if (!(el instanceof HTMLElement) || typeof el.animate !== "function" || still()) return then();
  el.animate([{ maxWidth: `${el.offsetWidth}px`, opacity: 1 }, { maxWidth: "0px", opacity: 0 }], { duration: 140, easing: "ease-out" }).finished.then(then, then);
}

/** Fades the canvas in when the selected tab changes, never when it is first drawn. */
export function useSwitchFade(ref: RefObject<HTMLElement | null>, key: string) {
  const last = useRef(key);
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    const node = ref.current;
    if (node && typeof node.animate === "function" && !still()) node.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 120, easing: "ease-out" });
  }, [ref, key]);
}

/** Where the strip's ends are, so the edge that waits can be faded in. */
function markEdges(el: HTMLElement) {
  const room = el.scrollWidth - el.clientWidth;
  el.dataset.scroll = room <= 1 ? "none" : el.scrollLeft <= 1 ? "start" : el.scrollLeft >= room - 1 ? "end" : "mid";
}

/** The tab strip's own behaviour: the tabs it cannot show at its width, and the
 *  width each tab is drawn at so that all of them fit — the way a browser's tab
 *  bar does. A trackpad's sideways swipe scrolls them.
 *
 * Both halves live here, on one ref, because a listener can only say which
 * input it is when the element it hangs off is the one this file declares. */
export function useTabStrip(keys: string[], labels: string[]): {
  strip: RefObject<HTMLDivElement | null>;
  hidden: string[];
  fitted: Record<string, { width: number; narrow: boolean }>;
} {
  const strip = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [fitted, setFitted] = useState<Record<string, { width: number; narrow: boolean }>>({});
  const joinedKeys = keys.join("\n");
  const joinedLabels = labels.join("\n");

  // The tabs that do not fit: they are the ones the overflow menu offers.
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const out = [...el.querySelectorAll<HTMLElement>("[data-key]")]
        .filter((tab) => { const r = tab.getBoundingClientRect(); return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1); })
        .map((tab) => tab.dataset.key!);
      setHidden((was) => (was.join("\n") === out.join("\n") ? was : out));
      markEdges(el);
    };
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    const stop = listenAction(el, "scroll", { action: "workbench.tab-overflow", listener: measure }, { passive: true });
    return () => { ro?.disconnect(); stop(); };
  }, [joinedKeys]);

  // The width each tab is drawn at, and the gesture that scrolls them.
  useLayoutEffect(() => {
    const el = strip.current;
    if (!el) return;
    const measure = () => {
      const rows = [...el.querySelectorAll<HTMLElement>(".workbench-tab[data-key]")];
      // A tab costs its chrome besides its title, so the whole title is what
      // says whether the row fits.
      const naturals = rows.map((row) => TAB_CHROME + (row.querySelector<HTMLElement>(".workbench-tab-name")?.scrollWidth ?? 0));
      const width = fitTabs(naturals, el.clientWidth);
      const next: Record<string, { width: number; narrow: boolean }> = {};
      rows.forEach((row, i) => {
        if (width === null) return;
        const w = Math.max(TAB_MIN_WIDTH, Math.min(naturals[i], width));
        next[row.dataset.key!] = { width: w, narrow: w < TAB_NARROW_WIDTH };
      });
      setFitted((was) => (JSON.stringify(was) === JSON.stringify(next) ? was : next));
      markEdges(el);
    };
    // A native listener: React's own wheel handler is passive, and a gesture
    // the page eats is a gesture the reader never gets.
    const onWheel = (e: Event) => {
      const wheel = e as WheelEvent;
      const delta = Math.abs(wheel.deltaX) >= Math.abs(wheel.deltaY) ? wheel.deltaX : wheel.deltaY;
      const room = el.scrollWidth - el.clientWidth;
      if (!delta || room <= 0) return;
      const next = el.scrollLeft + delta;
      if (next < 0 || next > room) return;
      wheel.preventDefault();
      el.scrollLeft = next;
      markEdges(el);
    };
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    const stop = listenAction(el, "wheel", { action: "workbench.tab-scroll", listener: onWheel }, { passive: false });
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      stop();
    };
  }, [joinedLabels]);

  return { strip, hidden, fitted };
}

/** Slides the workbench in from the right when it is brought out, never when it is
 *  drawn already out, so a window that opens with it open does not move. */
export function useOpenSlide(ref: RefObject<HTMLElement | null>, shown: boolean) {
  const was = useRef(shown);
  useEffect(() => {
    const opened = !was.current && shown;
    was.current = shown;
    const node = ref.current;
    if (opened && node && typeof node.animate === "function" && !still()) {
      node.animate([{ transform: "translateX(24px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 200, easing: "cubic-bezier(.2,0,0,1)" });
    }
  }, [ref, shown]);
}

/** Slides the workbench back out before it is put away; at once when motion is reduced. */
export function slideAway(el: HTMLElement | null, then: () => void) {
  if (!el || typeof el.animate !== "function" || still()) return then();
  el.animate([{ transform: "none", opacity: 1 }, { transform: "translateX(24px)", opacity: 0 }], { duration: 160, easing: "ease-in" }).finished.then(then, then);
}
