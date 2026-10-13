import { describe, expect, it } from "vitest";
import type { FrameEntry } from "./frames";
import type { VitalsMetric } from "./rows";
import { addPageFrames, applyMetric, EMPTY_PAGE, toRow } from "./rows";

// Only the fields the code reads. The real objects carry far more.
const metric = (fields: object) =>
  ({ rating: "good", navigationType: "navigate", navigationStartTime: 0, attribution: {}, ...fields }) as VitalsMetric;

// A 300 ms click handler, as `web-vitals` reports it before the browser has delivered the frame.
const slowInp = (attribution: object = {}) =>
  metric({
    name: "INP",
    value: 312,
    attribution: { interactionTime: 2000, inputDelay: 2, processingDuration: 300, presentationDelay: 10, longAnimationFrameEntries: [], ...attribution },
  });

const slowFrame: FrameEntry = {
  startTime: 2001,
  duration: 310,
  styleAndLayoutStart: 2306,
  blockingDuration: 260,
  firstUIEventTimestamp: 2000,
  scripts: [
    {
      invoker: "BUTTON#slow.onclick",
      startTime: 2002,
      duration: 300,
      forcedStyleAndLayoutDuration: 40,
      sourceURL: "http://localhost:5173/demo/main.ts",
      sourceFunctionName: "",
      sourceCharPosition: 988,
    },
  ],
};

const scriptLines = (page: typeof EMPTY_PAGE) => page.rows.INP?.details.slice(5);

describe("toRow", () => {
  it.each([
    [metric({ name: "TTFB", value: 41.6 }), "42 ms", []],
    [
      metric({ name: "CLS", value: 0.1234, attribution: { largestShiftTarget: "p.banner", largestShiftValue: 0.1, largestShiftTime: 900 } }),
      "0.123",
      [["largest shift", "p.banner"], ["its value", "0.100"], ["at", "900 ms"]],
    ],
    [
      metric({ name: "INP", value: 312, attribution: { interactionTarget: "#slow", inputDelay: 2, processingDuration: 300, presentationDelay: 10, longestScript: { entry: { sourceURL: "http://localhost:5173/demo/main.ts", sourceFunctionName: "", sourceCharPosition: 988 } } } }),
      "312 ms",
      [["target", "#slow"], ["type", "n/a"], ["1 input delay", "2 ms"], ["2 processing duration", "300 ms"], ["3 presentation delay", "10 ms"], ["longest script", "main.ts@988 (http://localhost:5173/demo/main.ts)"], ["script time", "n/a"], ["style and layout", "n/a"]],
    ],
  ])("formats $name with its attribution", (input, value, details) => {
    expect(toRow(input)).toMatchObject({ value, details });
  });
});

describe("applyMetric", () => {
  const loaded = applyMetric(EMPTY_PAGE, metric({ name: "LCP", value: 800 }));

  it("adds a metric from the same navigation to the existing rows", () => {
    const next = applyMetric(loaded, slowInp());
    expect(Object.keys(next.rows)).toEqual(["LCP", "INP"]);
  });

  it("starts fresh rows when a newer navigation reports", () => {
    const soft = metric({ name: "INP", value: 48, navigationType: "soft-navigation", navigationStartTime: 5000, navigationURL: "/two", attribution: { longAnimationFrameEntries: [] } });
    expect(applyMetric(loaded, soft)).toMatchObject({ navigationType: "soft-navigation", url: "/two", rows: { INP: { value: "48 ms" } } });
    expect(applyMetric(loaded, soft).rows).not.toHaveProperty("LCP");
  });

  it("stops waiting on the last navigation's INP interaction when a newer navigation reports", () => {
    const waiting = applyMetric(EMPTY_PAGE, slowInp());
    expect(waiting.inpSpan).toEqual({ start: 2000, end: 2302 });
    expect(applyMetric(waiting, metric({ name: "LCP", value: 300, navigationStartTime: 5000 })).inpSpan).toBeUndefined();
  });

  it("drops a late report from the navigation before the current one", () => {
    const current = applyMetric(loaded, metric({ name: "LCP", value: 300, navigationStartTime: 5000 }));
    expect(applyMetric(current, metric({ name: "CLS", value: 0.2, navigationStartTime: 0 }))).toBe(current);
  });
});

describe("the INP script lines", () => {
  const fromThePanel = [
    ["longest script", "main.ts@988 (http://localhost:5173/demo/main.ts) (panel)"],
    ["script time", "260 ms (panel)"],
    ["style and layout", "45 ms (panel)"],
  ];

  it.each([
    ["the frame arrives after web-vitals has reported", () => addPageFrames(applyMetric(EMPTY_PAGE, slowInp()), [slowFrame])],
    ["the frame arrived first", () => applyMetric(addPageFrames(EMPTY_PAGE, [slowFrame]), slowInp())],
  ])("are filled from the panel's frames, and marked, when %s", (_, build) => {
    expect(scriptLines(build())).toEqual(fromThePanel);
  });

  it("stay filled when a later metric and a later frame arrive", () => {
    const filled = addPageFrames(applyMetric(EMPTY_PAGE, slowInp()), [slowFrame]);
    const later = addPageFrames(applyMetric(filled, metric({ name: "CLS", value: 0.01 })), [{ ...slowFrame, startTime: 9000 }]);
    expect(scriptLines(later)).toEqual(fromThePanel);
  });

  it("are left as web-vitals wrote them when it named a frame itself", () => {
    const named = slowInp({ longAnimationFrameEntries: [{}], totalScriptDuration: 280, totalStyleAndLayoutDuration: 20 });
    expect(scriptLines(addPageFrames(applyMetric(EMPTY_PAGE, named), [slowFrame]))).toEqual([
      ["longest script", "n/a"],
      ["script time", "280 ms"],
      ["style and layout", "20 ms"],
    ]);
  });

  it.each([
    ["no frame overlaps the interaction", slowInp(), { ...slowFrame, startTime: 9000 }],
    ["the INP has no interaction time to match", slowInp({ interactionTime: undefined }), slowFrame],
  ])("stay empty when %s", (_, inp, frame) => {
    expect(scriptLines(addPageFrames(applyMetric(EMPTY_PAGE, inp), [frame]))).toEqual([
      ["longest script", "n/a"],
      ["script time", "n/a"],
      ["style and layout", "n/a"],
    ]);
  });
});
