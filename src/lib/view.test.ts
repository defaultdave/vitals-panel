import { expect, it } from "vitest";
import { addEntries, emptyLive } from "./live";
import { EMPTY_PAGE } from "./rows";
import { toPanelView } from "./view";

const empty = { page: EMPTY_PAGE, live: emptyLive(0) };

it("draws every row before anything has reported, and says how to get a value", () => {
  const view = toPanelView(empty);

  expect(view.page.map((m) => [m.name, m.value, m.rating, m.details.length])).toEqual([
    ["TTFB", "waiting", "none", 0],
    ["FCP", "waiting", "none", 0],
    ["LCP", "waiting", "none", 5],
    ["INP", "interact first", "none", 8],
    ["CLS", "waiting", "none", 3],
  ]);
  expect(view.live.map((m) => [m.name, m.value, m.rating, m.details.length])).toEqual([
    ["last interaction", "interact", "none", 9],
    ["worst interaction", "interact", "none", 1],
    ["worst frame", "none yet", "none", 3],
    ["layout shift", "0.000", "good", 0],
  ]);
  expect(view.page.flatMap((m) => m.details).every((d) => d.text === "-" && d.title === "")).toBe(true);
});

it("describes every row, with the good value that web-vitals rates against", () => {
  const view = toPanelView(empty);

  expect([...view.page, ...view.live].filter((m) => m.about === "").map((m) => m.name)).toEqual([]);
  expect(view.page[2]?.about).toContain("Good is 2500 ms or less.");
});

it("fills a reported row by label, and leaves a detail the row lacks as a dash", () => {
  const page = {
    ...EMPTY_PAGE,
    rows: { LCP: { name: "LCP", value: "812 ms", rating: "good" as const, details: [["element", "main > h1"] as [string, string]] } },
  };
  const live = addEntries(emptyLive(0), [
    { interactionId: 3, name: "click", startTime: 2000, duration: 320, processingStart: 2002, processingEnd: 2302, target: "button#slow" },
  ]);
  const view = toPanelView({ page, live });

  expect(view.page[2]).toMatchObject({ name: "LCP", value: "812 ms", rating: "good" });
  expect(view.page[2]?.details.slice(0, 2)).toEqual([
    { label: "element", text: "main > h1", title: "main > h1" },
    { label: "1 time to first byte", text: "-", title: "" },
  ]);
  expect(view.liveHeading).toBe("Since reset (1)");
  expect(view.live[1]).toEqual({
    name: "worst interaction",
    value: "320 ms",
    rating: "needs-improvement",
    details: [{ label: "target", text: "button#slow", title: "button#slow" }],
    about: expect.any(String),
  });
});
