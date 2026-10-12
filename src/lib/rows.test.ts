import { describe, expect, it } from "vitest";
import type { VitalsMetric } from "./rows";
import { applyMetric, EMPTY_PAGE, toRow } from "./rows";

// Only the fields the code reads. The real objects carry far more.
const metric = (fields: object) =>
  ({ rating: "good", navigationType: "navigate", navigationStartTime: 0, attribution: {}, ...fields }) as VitalsMetric;

describe("toRow", () => {
  it.each([
    [metric({ name: "TTFB", value: 41.6 }), "42 ms", []],
    [
      metric({ name: "CLS", value: 0.1234, attribution: { largestShiftTarget: "p.banner", largestShiftValue: 0.1, largestShiftTime: 900 } }),
      "0.123",
      [["largest shift", "p.banner"], ["its value", "0.100"], ["at", "900 ms"]],
    ],
    [
      metric({ name: "INP", value: 312, attribution: { interactionTarget: "#slow", inputDelay: 2, processingDuration: 300, presentationDelay: 10 } }),
      "312 ms",
      [["target", "#slow"], ["type", "n/a"], ["1 input delay", "2 ms"], ["2 processing duration", "300 ms"], ["3 presentation delay", "10 ms"], ["script time", "n/a"], ["style and layout", "n/a"]],
    ],
  ])("formats $name with its attribution", (input, value, details) => {
    expect(toRow(input)).toMatchObject({ value, details });
  });
});

describe("applyMetric", () => {
  const loaded = applyMetric(EMPTY_PAGE, metric({ name: "LCP", value: 800 }));

  it("adds a metric from the same navigation to the existing rows", () => {
    const next = applyMetric(loaded, metric({ name: "INP", value: 120 }));
    expect(Object.keys(next.rows)).toEqual(["LCP", "INP"]);
  });

  it("starts fresh rows when a newer navigation reports", () => {
    const soft = metric({ name: "INP", value: 48, navigationType: "soft-navigation", navigationStartTime: 5000, navigationURL: "/two" });
    expect(applyMetric(loaded, soft)).toMatchObject({ navigationType: "soft-navigation", url: "/two", rows: { INP: { value: "48 ms" } } });
    expect(applyMetric(loaded, soft).rows).not.toHaveProperty("LCP");
  });

  it("drops a late report from the navigation before the current one", () => {
    const current = applyMetric(loaded, metric({ name: "LCP", value: 300, navigationStartTime: 5000 }));
    expect(applyMetric(current, metric({ name: "CLS", value: 0.2, navigationStartTime: 0 }))).toBe(current);
  });
});
