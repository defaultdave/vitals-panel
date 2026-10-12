import { describe, expect, it } from "vitest";
import type { TimingEntry } from "./live";
import { addEntries, addShift, emptyLive, rate, summarize, withEventAt, withoutEventsAt } from "./live";

const entry = (fields: Partial<TimingEntry>): TimingEntry => ({
  interactionId: 1,
  name: "click",
  startTime: 1000,
  duration: 16,
  processingStart: 1001,
  processingEnd: 1002,
  target: "button#fast",
  ...fields,
});

// A 300 ms click handler. The pointerup starts first and runs longest, but its own handler is instant.
const slowClick = [
  entry({ interactionId: 7, name: "pointerup", startTime: 2000, duration: 320, processingStart: 2002, processingEnd: 2003, target: "button#slow" }),
  entry({ interactionId: 7, name: "click", startTime: 2004, duration: 312, processingStart: 2004, processingEnd: 2304, target: "button#slow" }),
];

describe("summarize", () => {
  it("counts a slow click handler as processing, not as the pointerup's presentation delay", () => {
    expect(summarize(slowClick)).toEqual({
      id: 7,
      type: "pointerup",
      target: "button#slow",
      at: 2000,
      duration: 320,
      inputDelay: 2,
      processing: 302,
      presentation: 16,
    });
  });
});

describe("addEntries", () => {
  it("keeps the last and the worst interaction apart", () => {
    const afterSlow = addEntries(emptyLive(0), slowClick);
    const afterFast = addEntries(afterSlow, [entry({ interactionId: 8, startTime: 4000 })]);
    expect(afterFast).toMatchObject({ count: 2, last: { id: 8, duration: 16 }, worst: { id: 7, duration: 320 } });
  });

  it("counts one interaction once when its events arrive in separate batches", () => {
    const [pointerup, click] = slowClick;
    const live = addEntries(addEntries(emptyLive(0), [pointerup!]), [click!]);
    expect(live).toMatchObject({ count: 1, last: { processing: 302 } });
  });

  it.each([
    ["an event that is not an interaction", entry({ interactionId: 0 })],
    ["an interaction from before the reset", entry({ startTime: 400 })],
  ])("skips %s", (_, skipped) => {
    const live = emptyLive(500);
    expect(addEntries(live, [skipped])).toBe(live);
  });
});

describe("withoutEventsAt", () => {
  it("leaves out the entries of events at the given times, and keeps one a fraction of a millisecond away", () => {
    // Tab from the page into the panel: the keydown is the page's, the keyup 0.2 ms later is the panel's.
    const keydownOnPage = entry({ interactionId: 5, name: "keydown", startTime: 3000.7 });
    const keyupOnPanel = entry({ interactionId: 5, name: "keyup", startTime: 3000.9 });
    expect(withoutEventsAt([keydownOnPage, keyupOnPanel], [3000.9, 9000])).toEqual([keydownOnPage]);
  });
});

describe("withEventAt", () => {
  it("keeps the newest 50 event times", () => {
    const times = Array.from({ length: 51 }, (_, at) => at).reduce(withEventAt, []);
    expect([times.length, times[0], times.at(-1)]).toEqual([50, 1, 50]);
  });
});

describe("addShift", () => {
  const shift = (startTime: number, value: number, hadRecentInput = false) => ({ startTime, value, hadRecentInput });

  it.each([
    ["sums shifts less than 1 s apart", 0, [shift(1000, 0.1), shift(1500, 0.05)], 0.15],
    ["starts a new window after a 1 s gap and keeps the larger one", 0, [shift(1000, 0.1), shift(2500, 0.05)], 0.1],
    ["closes a window at 5 s long", 0, [0, 900, 1800, 2700, 3600, 4500, 5400].map((at) => shift(at, 0.1)), 0.6],
    ["skips a shift right after input", 0, [shift(1000, 0.3, true)], 0],
    ["skips a shift from before the reset", 500, [shift(100, 0.3)], 0],
  ])("%s", (_, since, shifts, expected) => {
    expect(shifts.reduce(addShift, emptyLive(since)).shift).toBeCloseTo(expected);
  });
});

describe("rate", () => {
  it.each([
    [undefined, "none"],
    [200, "good"],
    [201, "needs-improvement"],
    [501, "poor"],
  ])("rates %s on the INP scale as %s", (value, expected) => {
    expect(rate(value, [200, 500])).toBe(expected);
  });
});
