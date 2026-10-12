/**
 * The one module that touches `web-vitals` and `PerformanceObserver`.
 *
 * `web-vitals` has no unsubscribe, so observers are started once per page, on
 * the first subscription, and every panel and listener shares the result.
 * Mounting, unmounting and mounting again does not register them twice.
 */
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals/attribution";
import type { ShiftEntry, TimingEntry } from "./live";
import { addEntries, addShift, emptyLive, withEventAt, withoutEventsAt } from "./live";
import type { VitalsSnapshot } from "./report";
import type { VitalsMetric } from "./rows";
import { applyMetric, EMPTY_PAGE } from "./rows";

// The lowest threshold the Event Timing API accepts. Shorter interactions are never reported.
const MIN_EVENT_DURATION_MS = 16;
// Event types whose entries can carry an interactionId. Listing one that never does costs nothing.
const INTERACTION_EVENTS = ["pointerdown", "pointerup", "click", "contextmenu", "keydown", "keypress", "keyup"];

const EMPTY: VitalsSnapshot = { page: EMPTY_PAGE, live: emptyLive(0) };

let snapshot = EMPTY;
let started = false;
let ignoredEventTimes: number[] = [];
const snapshotListeners = new Set<() => void>();
const metricListeners = new Set<(metric: VitalsMetric) => void>();

function setSnapshot(next: VitalsSnapshot) {
  if (next.page === snapshot.page && next.live === snapshot.live) return;
  snapshot = next;
  for (const listener of snapshotListeners) listener();
}

function describeTarget(node: Node | null): string {
  if (!(node instanceof Element)) return "n/a";
  const tag = node.tagName.toLowerCase();
  if (node.id) return `${tag}#${node.id}`;
  return [tag, ...node.classList].join(".");
}

function toTimingEntry(entry: PerformanceEventTiming): TimingEntry {
  return {
    interactionId: entry.interactionId,
    name: entry.name,
    startTime: entry.startTime,
    duration: entry.duration,
    processingStart: entry.processingStart,
    processingEnd: entry.processingEnd,
    target: describeTarget(entry.target),
  };
}

function observeLive() {
  const supported = globalThis.PerformanceObserver?.supportedEntryTypes ?? [];
  if (supported.includes("event")) {
    const events = new PerformanceObserver((list) => {
      const entries = (list.getEntries() as PerformanceEventTiming[]).map(toTimingEntry);
      setSnapshot({ ...snapshot, live: addEntries(snapshot.live, withoutEventsAt(entries, ignoredEventTimes)) });
    });
    // Not buffered: this window starts now. `durationThreshold` is missing from TypeScript's DOM types.
    events.observe({ type: "event", durationThreshold: MIN_EVENT_DURATION_MS } as PerformanceObserverInit);
  }
  if (supported.includes("layout-shift")) {
    const shifts = new PerformanceObserver((list) => {
      // `LayoutShift` is missing from TypeScript's DOM types.
      const live = (list.getEntries() as unknown as ShiftEntry[]).reduce(addShift, snapshot.live);
      setSnapshot({ ...snapshot, live });
    });
    shifts.observe({ type: "layout-shift" });
  }
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  snapshot = { ...snapshot, live: emptyLive(performance.now()) };

  const report = (metric: VitalsMetric) => {
    for (const listener of metricListeners) listener(metric);
    setSnapshot({ ...snapshot, page: applyMetric(snapshot.page, metric) });
  };
  // `reportSoftNavs` restarts every metric on a client-side route change, in Chromium 151 and later.
  const opts = { reportAllChanges: true, reportSoftNavs: true };
  onTTFB(report, opts);
  onFCP(report, opts);
  onLCP(report, opts);
  onINP(report, opts);
  onCLS(report, opts);
  observeLive();
}

/**
 * Subscribes to changes in the readings and starts measuring on the first
 * call. Read the new value with {@link getVitals}. With {@link getServerVitals}
 * they are the three arguments of React's `useSyncExternalStore`.
 * @param listener - Called after every change.
 * @returns A function that removes the listener.
 */
export function subscribeVitals(listener: () => void): () => void {
  start();
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
}

/** @returns The current readings. The same object until something changes. */
export const getVitals = (): VitalsSnapshot => snapshot;

/**
 * @returns The empty readings: what a server renders, and so what React needs
 * as the third argument of `useSyncExternalStore` while it hydrates.
 */
export const getServerVitals = (): VitalsSnapshot => EMPTY;

/**
 * Subscribes to the raw `web-vitals` metrics as they are reported, for logging
 * them or sending them somewhere.
 * @param listener - Called with each metric, attribution included.
 * @returns A function that removes the listener.
 */
export function onVitalsMetric(listener: (metric: VitalsMetric) => void): () => void {
  start();
  metricListeners.add(listener);
  return () => {
    metricListeners.delete(listener);
  };
}

/**
 * Keeps interactions with one element out of the live reading. The panel calls
 * this for itself, so pressing Copy does not show up as the last interaction.
 * @param element - The element to leave out. A shadow host covers its whole tree.
 * @returns A function that stops leaving it out.
 */
export function ignoreInteractionsWith(element: EventTarget): () => void {
  const listening = new AbortController();
  const note = (event: Event) => {
    ignoredEventTimes = withEventAt(ignoredEventTimes, event.timeStamp);
  };
  for (const type of INTERACTION_EVENTS) {
    element.addEventListener(type, note, { capture: true, signal: listening.signal });
  }
  return () => listening.abort();
}

/**
 * Restarts the live reading from now. The page-view rows are left alone: they
 * belong to `web-vitals` and restart only on a navigation.
 */
export function resetLive(): void {
  setSnapshot({ ...snapshot, live: emptyLive(performance.now()) });
}
