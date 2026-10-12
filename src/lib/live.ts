/**
 * The live reading: the panel's own window over raw Event Timing and
 * layout-shift entries, which the Reset button restarts.
 *
 * `web-vitals` cannot do this. Its INP and CLS are high-water marks for the
 * whole page view, it has no reset, and a second subscription replays the
 * browser's buffered entries. So this file keeps a separate, clearly labeled
 * reading. Pure reducers, no browser APIs.
 */
import type { Rating } from "./rows";

/** The fields of a `PerformanceEventTiming` entry the live reading uses. */
export interface TimingEntry {
  interactionId: number;
  name: string;
  startTime: number;
  duration: number;
  processingStart: number;
  processingEnd: number;
  target: string;
}

/** One interaction (a click, tap or key press), measured to the next paint. */
export interface Interaction {
  id: number;
  /** The event that ran longest, for example "pointerup" or "keydown". */
  type: string;
  target: string;
  /** Start, in ms since the time origin. */
  at: number;
  duration: number;
  inputDelay: number;
  processing: number;
  presentation: number;
}

/** The fields of a `layout-shift` entry the live reading uses. */
export interface ShiftEntry {
  startTime: number;
  value: number;
  hadRecentInput: boolean;
}

/** Everything measured since the last reset. */
export interface LiveReading {
  /** When this window started, in ms since the time origin. */
  since: number;
  /** Interactions seen in the window. Ones under 16 ms are not reported by the browser. */
  count: number;
  last: Interaction | undefined;
  worst: Interaction | undefined;
  /** Raw entries for the newest interactions, kept because one interaction's events can arrive in separate batches. */
  recent: ReadonlyMap<number, TimingEntry[]>;
  /** The largest layout-shift session window since the reset, scored the way CLS is. */
  shift: number;
  shiftWindow: { value: number; start: number; last: number };
}

const RECENT_LIMIT = 10;
// Event durations are rounded to 8 ms, so events presented in the same frame end within 8 ms of each other.
const SAME_FRAME_MS = 8;
// A CLS session window closes after a 1 s gap or at 5 s long.
const SHIFT_GAP_MS = 1000;
const SHIFT_WINDOW_MS = 5000;
// Entries arrive within a frame or two of their events, so only the newest event times can still match one.
const EVENT_TIMES_LIMIT = 50;

/**
 * Starts an empty window.
 * @param since - The window's start, in ms since the time origin.
 * @returns A reading with nothing in it.
 */
export function emptyLive(since: number): LiveReading {
  return {
    since,
    count: 0,
    last: undefined,
    worst: undefined,
    recent: new Map(),
    shift: 0,
    shiftWindow: { value: 0, start: 0, last: 0 },
  };
}

const endOf = (entry: TimingEntry) => entry.startTime + entry.duration;

/**
 * Reduces the events of one interaction to its duration and three parts.
 * The duration is the longest event's. The parts span every event presented
 * in that event's frame, so a slow click handler is counted as processing and
 * not as the pointerup's presentation delay.
 * @param entries - All entries seen so far that share one interactionId. Must not be empty.
 * @returns The interaction summary.
 */
export function summarize(entries: TimingEntry[]): Interaction {
  const longest = entries.reduce((a, b) => (b.duration > a.duration ? b : a));
  const frame = entries.filter((e) => Math.abs(endOf(e) - endOf(longest)) <= SAME_FRAME_MS);
  const at = Math.min(...frame.map((e) => e.startTime));
  const processingStart = Math.min(...frame.map((e) => e.processingStart));
  const processingEnd = Math.max(...frame.map((e) => e.processingEnd));
  return {
    id: longest.interactionId,
    type: longest.name,
    target: longest.target,
    at,
    duration: longest.duration,
    inputDelay: processingStart - at,
    processing: processingEnd - processingStart,
    presentation: Math.max(0, endOf(longest) - processingEnd),
  };
}

/**
 * Adds an event's time to the list that {@link withoutEventsAt} matches against.
 * @param eventTimes - The times so far, oldest first.
 * @param at - The `timeStamp` of an event to leave out.
 * @returns The newest 50 times, the new one last.
 */
export function withEventAt(eventTimes: readonly number[], at: number): number[] {
  return [...eventTimes.slice(1 - EVENT_TIMES_LIMIT), at];
}

/**
 * Leaves out the entries of events that the live reading does not count, such
 * as a click on the panel. An entry never names an element inside a shadow
 * tree, so the events are matched by time: an entry's startTime is its event's
 * timeStamp. The match is exact, because a key can go down on the page and
 * come up on the panel a fraction of a millisecond later.
 * @param entries - Entries from one observer callback.
 * @param eventTimes - The `timeStamp` of each event to leave out.
 * @returns The entries of every other event.
 */
export function withoutEventsAt(entries: TimingEntry[], eventTimes: readonly number[]): TimingEntry[] {
  return entries.filter((e) => !eventTimes.includes(e.startTime));
}

/**
 * Adds a batch of event entries to the window.
 * @param live - The current reading.
 * @param entries - Entries from one observer callback. Entries with no interactionId, or from before the window, are skipped.
 * @returns The next reading, or the same object when nothing counted.
 */
export function addEntries(live: LiveReading, entries: TimingEntry[]): LiveReading {
  const counted = entries.filter((e) => e.interactionId > 0 && e.startTime >= live.since);
  if (counted.length === 0) return live;

  const recent = new Map(live.recent);
  for (const entry of counted) {
    recent.set(entry.interactionId, [...(recent.get(entry.interactionId) ?? []), entry]);
  }
  const count = live.count + recent.size - live.recent.size;

  // A touched interaction is summarized again from all its entries, so its older summary is dropped.
  const touchedIds = new Set(counted.map((e) => e.interactionId));
  const touched = [...touchedIds].map((id) => summarize(recent.get(id) ?? []));
  const untouched = (i: Interaction | undefined) => (i && !touchedIds.has(i.id) ? [i] : []);
  const last = [...untouched(live.last), ...touched].reduce((a, b) => (b.at >= a.at ? b : a));
  const worst = [...untouched(live.worst), ...touched].reduce((a, b) => (b.duration > a.duration ? b : a));

  for (const id of [...recent.keys()].slice(0, -RECENT_LIMIT)) recent.delete(id);
  return { ...live, count, last, worst, recent };
}

/**
 * Adds a layout shift to the window, using the CLS session-window rule.
 * @param live - The current reading.
 * @param entry - A layout-shift entry. Shifts right after input, or from before the window, are skipped.
 * @returns The next reading, or the same object when the shift did not count.
 */
export function addShift(live: LiveReading, entry: ShiftEntry): LiveReading {
  if (entry.hadRecentInput || entry.startTime < live.since) return live;
  const open = live.shiftWindow;
  const sameWindow =
    open.value > 0 && entry.startTime - open.last < SHIFT_GAP_MS && entry.startTime - open.start < SHIFT_WINDOW_MS;
  const shiftWindow = sameWindow
    ? { value: open.value + entry.value, start: open.start, last: entry.startTime }
    : { value: entry.value, start: entry.startTime, last: entry.startTime };
  return { ...live, shiftWindow, shift: Math.max(live.shift, shiftWindow.value) };
}

/**
 * Rates a value against a metric's good and poor thresholds.
 * @param value - The measured value, or undefined when there is none yet.
 * @param thresholds - The largest "good" value and the largest "needs improvement" value.
 * @returns The rating, or "none" for no value.
 */
export function rate(value: number | undefined, [good, poor]: readonly [number, number]): Rating {
  if (value === undefined) return "none";
  if (value > poor) return "poor";
  return value > good ? "needs-improvement" : "good";
}
