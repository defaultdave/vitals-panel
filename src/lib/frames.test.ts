import { describe, expect, it } from "vitest";
import type { FrameEntry, ScriptEntry } from "./frames";
import { describeSource, keepFrames, longestScript, scriptsDuring, withoutFramesAt } from "./frames";

const script = (fields: Partial<ScriptEntry>): ScriptEntry => ({
  invoker: "BUTTON#slow.onclick",
  startTime: 2004,
  duration: 300,
  forcedStyleAndLayoutDuration: 0,
  sourceURL: "http://localhost:5173/demo/main.ts",
  sourceFunctionName: "",
  sourceCharPosition: 988,
  ...fields,
});

const frame = (fields: Partial<FrameEntry>): FrameEntry => ({
  startTime: 2003,
  duration: 310,
  styleAndLayoutStart: 0,
  blockingDuration: 260,
  firstUIEventTimestamp: 2000,
  scripts: [script({})],
  ...fields,
});

describe("describeSource", () => {
  it.each([
    ["an anonymous function", script({}), "main.ts@988 (http://localhost:5173/demo/main.ts)"],
    [
      "a named function, without the query string in the file name",
      script({ sourceURL: "https://cdn.example/app.js?v=3", sourceFunctionName: "save", sourceCharPosition: 12 }),
      "app.js@12 save (https://cdn.example/app.js?v=3)",
    ],
    ["a script with no known position", script({ sourceCharPosition: -1 }), "main.ts (http://localhost:5173/demo/main.ts)"],
    ["a function with no URL", script({ sourceURL: "", sourceFunctionName: "save" }), "save"],
    ["a script with no source", script({ sourceURL: "" }), "n/a"],
    ["no script", undefined, "n/a"],
  ])("names %s", (_, source, expected) => {
    expect(describeSource(source)).toBe(expected);
  });
});

describe("longestScript", () => {
  it("picks the script that ran longest, and nothing from a frame that lists none", () => {
    const slow = script({ invoker: "Window.requestAnimationFrame", duration: 80 });
    expect(longestScript(frame({ scripts: [script({ duration: 20 }), slow] }))).toBe(slow);
    expect(longestScript(frame({ scripts: [] }))).toBeUndefined();
  });
});

describe("withoutFramesAt", () => {
  it("leaves out a frame that began with one of the given events", () => {
    const onPage = frame({ firstUIEventTimestamp: 2000 });
    const onPanel = frame({ firstUIEventTimestamp: 3000.9 });
    expect(withoutFramesAt([onPage, onPanel], [3000.9, 9000])).toEqual([onPage]);
  });
});

describe("keepFrames", () => {
  it("keeps the newest 10 frames, and an older one that a span still needs", () => {
    const frames = Array.from({ length: 13 }, (_, n) => frame({ startTime: n * 1000, duration: 100 }));
    const kept = keepFrames(frames, [{ start: 1050, end: 1060 }]);
    expect(kept.map((f) => f.startTime)).toEqual([1000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000]);
  });
});

describe("scriptsDuring", () => {
  const span = { start: 2000, end: 2304 };

  it("has nothing to say when no frame overlaps the span", () => {
    expect(scriptsDuring([frame({ startTime: 5000 })], span)).toBeUndefined();
  });

  it("splits a script's time into script and the style and layout it forced, and adds the frame's own", () => {
    const thrashing = script({ forcedStyleAndLayoutDuration: 60 });
    // The frame ends at 2313, so its own style and layout took 5 ms.
    expect(scriptsDuring([frame({ styleAndLayoutStart: 2308, scripts: [thrashing] })], span)).toEqual({
      longest: thrashing,
      scriptTime: 240,
      forcedStyleAndLayout: 60,
      styleAndLayout: 65,
    });
  });

  it("counts a script that was already running only from the start of the span", () => {
    // 400 ms long, half of it before the span: the script that kept the input waiting.
    const blocking = script({ startTime: 1800, duration: 400, forcedStyleAndLayoutDuration: 100 });
    const handler = script({ startTime: 2200, duration: 104 });
    const frames = [frame({ startTime: 1800, duration: 410, scripts: [blocking] }), frame({ startTime: 2200, scripts: [handler] })];
    expect(scriptsDuring(frames, span)).toEqual({ longest: blocking, scriptTime: 254, forcedStyleAndLayout: 50, styleAndLayout: 50 });
  });

  it("names no script for a frame whose scripts were all under 5 ms", () => {
    expect(scriptsDuring([frame({ scripts: [] })], span)).toEqual({
      longest: undefined,
      scriptTime: 0,
      forcedStyleAndLayout: 0,
      styleAndLayout: 0,
    });
  });
});
