import { expect, it } from "vitest";
import { addEntries, addFrames, emptyLive } from "./live";
import { toReportText } from "./report";
import { EMPTY_PAGE } from "./rows";

it("writes both readings in full, and says which page-view metrics have not reported", () => {
  const page = {
    ...EMPTY_PAGE,
    url: "http://localhost:5173/",
    rows: { LCP: { name: "LCP", value: "812 ms", rating: "good" as const, details: [["element", "main > h1.a-very-long-selector"] as [string, string]] } },
  };
  const clicked = addEntries(emptyLive(1000), [
    { interactionId: 3, name: "click", startTime: 2000, duration: 320, processingStart: 2002, processingEnd: 2302, target: "button#slow" },
  ]);
  const live = addFrames(clicked, [
    {
      startTime: 2001,
      duration: 310,
      styleAndLayoutStart: 2309,
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
    },
  ]);
  const report = toReportText(
    { page, live },
    { url: "http://localhost:5173/", userAgent: "TestBrowser/1.0", capturedAt: "2026-10-10T16:00:00.000Z", now: 13_400 },
  );

  expect(report).toBe(
    [
      "Web vitals: http://localhost:5173/",
      "Captured: 2026-10-10T16:00:00.000Z",
      "Navigation: navigate to http://localhost:5173/",
      "User agent: TestBrowser/1.0",
      "Lab reading from one page view on this device. Not field data.",
      "",
      "Page view (web-vitals)",
      "TTFB  not reported yet",
      "FCP   not reported yet",
      "LCP   812 ms  good",
      "  element: main > h1.a-very-long-selector",
      "INP   not reported yet",
      "CLS   not reported yet",
      "",
      "Since reset (1 interactions in 12.4 s)",
      "last interaction   320 ms  needs-improvement",
      "  target: button#slow",
      "  type: click",
      "  1 input delay: 2 ms",
      "  2 processing duration: 300 ms",
      "  3 presentation delay: 18 ms",
      "  longest script: main.ts@988 (http://localhost:5173/demo/main.ts)",
      "  its invoker: BUTTON#slow.onclick",
      "  script time: 260 ms",
      "  forced style and layout: 40 ms",
      "worst interaction  320 ms  needs-improvement",
      "  target: button#slow",
      "  type: click",
      "  1 input delay: 2 ms",
      "  2 processing duration: 300 ms",
      "  3 presentation delay: 18 ms",
      "  longest script: main.ts@988 (http://localhost:5173/demo/main.ts)",
      "  its invoker: BUTTON#slow.onclick",
      "  script time: 260 ms",
      "  forced style and layout: 40 ms",
      "worst frame        310 ms",
      "  blocking duration: 260 ms",
      "  longest script: main.ts@988 (http://localhost:5173/demo/main.ts)",
      "  its invoker: BUTTON#slow.onclick",
      "layout shift       0.000  good",
    ].join("\n"),
  );
});
