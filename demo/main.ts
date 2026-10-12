/** A page with one fast control, one slow one, a late layout shift and a client-side route change. */
import { mountVitalsPanel } from "../src";

// Longer than the 500 ms in which a layout shift is excused as a response to input.
const SHIFT_DELAY_MS = 700;
const TITLES: Record<string, string> = { "/": "vitals-panel demo", "/two": "Page two" };

function find(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`The demo page has no #${id} element.`);
  return element;
}

function block(durationMs: number) {
  const end = performance.now() + durationMs;
  while (performance.now() < end) {
    // Busy-wait: holds the main thread the way a slow handler does.
  }
}

const banner = find("banner");
const title = find("title");
const count = find("count");
const slow = find("slow");

function countClick() {
  count.textContent = String(Number(count.textContent) + 1);
}

function showRoute() {
  title.textContent = TITLES[window.location.pathname] ?? TITLES["/"] ?? "";
}

find("fast").addEventListener("click", countClick);

slow.addEventListener("click", () => {
  block(Number(slow.dataset.blockMs));
  countClick();
});

find("shift").addEventListener("click", () => {
  setTimeout(() => {
    banner.hidden = !banner.hidden;
  }, SHIFT_DELAY_MS);
});

// A click, a URL change and a paint: what the browser needs to call it a soft navigation.
find("route").addEventListener("click", () => {
  window.history.pushState({}, "", window.location.pathname === "/two" ? "/" : "/two");
  showRoute();
});

showRoute();
mountVitalsPanel({ log: true });
