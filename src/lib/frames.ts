/**
 * Long animation frames: which script ran in a slow frame, and for how long.
 *
 * The browser reports a frame that takes more than 50 ms from its first task to
 * the end of its rendering, with the scripts in it that ran for more than 5 ms.
 * It does not say which interaction a frame belongs to, so the two are matched
 * by time. Pure functions, no browser APIs.
 */

/** Where a script was entered. A `PerformanceScriptTiming` entry fits. */
export interface ScriptSource {
  /** Empty when the browser withholds it. */
  sourceURL: string;
  /** Empty for an anonymous function, and for a cross-origin script loaded without CORS. */
  sourceFunctionName: string;
  /** A character offset into the file, not a line number. -1 when unknown. */
  sourceCharPosition: number;
}

/** The fields of a `PerformanceScriptTiming` entry the panel uses. */
export interface ScriptEntry extends ScriptSource {
  /** How the script was called, for example "BUTTON#save.onclick" or "Window.requestAnimationFrame". */
  invoker: string;
  startTime: number;
  duration: number;
  forcedStyleAndLayoutDuration: number;
}

/** The fields of a `long-animation-frame` entry the panel uses. */
export interface FrameEntry {
  startTime: number;
  duration: number;
  /** When the frame's own style and layout began, or 0 when it rendered nothing. */
  styleAndLayoutStart: number;
  /** How long the frame kept input waiting: the part of each task past 50 ms, after the rendering time is added to the longest task. */
  blockingDuration: number;
  /** The `timeStamp` of the first event handled in the frame, or 0 when there was none. */
  firstUIEventTimestamp: number;
  scripts: ScriptEntry[];
}

/** A stretch of time, in ms since the time origin. */
export interface Span {
  start: number;
  end: number;
}

/** What the scripts in a span of time add up to. */
export interface ScriptSummary {
  /** The script that ran longest inside the span. Undefined when every script was under 5 ms. */
  longest: ScriptEntry | undefined;
  /** Script time inside the span, without the style and layout the scripts forced. */
  scriptTime: number;
  forcedStyleAndLayout: number;
  /** Style and layout in all: what the scripts forced, and each frame's own at its end. */
  styleAndLayout: number;
}

// Frames that belong to no interaction on show are dropped once this many newer ones exist.
const FRAME_LIMIT = 10;
const NO_SOURCE = "n/a";

const endOf = (timed: { startTime: number; duration: number }) => timed.startTime + timed.duration;
// Inclusive at both ends, as in `web-vitals`: a frame that only touches the span still counts.
const overlaps = (frame: FrameEntry, span: Span) => frame.startTime <= span.end && endOf(frame) >= span.start;

/**
 * Names a script's entry point, shortest part first, because the panel cuts a
 * long value off at the end.
 * @param script - The script, or undefined when there is none.
 * @returns The file name and character offset, the function name when it has one, and the full URL. "n/a" for no source.
 */
export function describeSource(script: ScriptSource | undefined): string {
  if (!script?.sourceURL) return script?.sourceFunctionName || NO_SOURCE;
  const path = script.sourceURL.split(/[?#]/)[0] ?? "";
  const file = path.split("/").filter(Boolean).at(-1) ?? path;
  const position = script.sourceCharPosition >= 0 ? `@${script.sourceCharPosition}` : "";
  return [`${file}${position}`, script.sourceFunctionName, `(${script.sourceURL})`].filter(Boolean).join(" ");
}

/**
 * Picks the script that ran longest in a frame.
 * @param frame - A long animation frame.
 * @returns The script, or undefined when the frame lists none.
 */
export function longestScript(frame: FrameEntry): ScriptEntry | undefined {
  return frame.scripts.reduce<ScriptEntry | undefined>((a, b) => (a && a.duration >= b.duration ? a : b), undefined);
}

/**
 * Leaves out the frames that began with an event the live reading does not
 * count, such as a click on the panel. The match is exact, as it is for event
 * entries: a frame's firstUIEventTimestamp is that event's timeStamp.
 * @param frames - Frames from one observer callback.
 * @param eventTimes - The `timeStamp` of each event to leave out.
 * @returns Every other frame.
 */
export function withoutFramesAt(frames: FrameEntry[], eventTimes: readonly number[]): FrameEntry[] {
  return frames.filter((frame) => !eventTimes.includes(frame.firstUIEventTimestamp));
}

/**
 * Drops old frames, and keeps any that a span still needs however old it is.
 * @param frames - Frames, oldest first.
 * @param spans - The spans whose frames must stay, such as the interactions on show.
 * @returns The newest 10 frames and every frame that overlaps or touches a span, oldest first.
 */
export function keepFrames(frames: readonly FrameEntry[], spans: Span[]): FrameEntry[] {
  const newest = frames.slice(-FRAME_LIMIT);
  return frames.filter((frame) => newest.includes(frame) || spans.some((span) => overlaps(frame, span)));
}

/**
 * Adds up the scripts that ran in a span, the way `web-vitals` does for INP. A
 * script that started before the span counts from the span's start, and its
 * forced style and layout is shared out in the same proportion. A frame's own
 * style and layout counts whole.
 * @param frames - Long animation frames, in any order.
 * @param span - The stretch of time to look at.
 * @returns The summary, or undefined when no frame overlaps or touches the span: nothing in it took 50 ms.
 */
export function scriptsDuring(frames: readonly FrameEntry[], span: Span): ScriptSummary | undefined {
  const during = frames.filter((frame) => overlaps(frame, span));
  if (during.length === 0) return undefined;

  const ownStyleAndLayout = during.reduce(
    (total, frame) => total + (frame.styleAndLayoutStart > 0 ? endOf(frame) - frame.styleAndLayoutStart : 0),
    0,
  );
  let summary: ScriptSummary = {
    longest: undefined,
    scriptTime: 0,
    forcedStyleAndLayout: 0,
    styleAndLayout: ownStyleAndLayout,
  };
  let longestInside = 0;
  for (const script of during.flatMap((frame) => frame.scripts)) {
    const inside = endOf(script) - Math.max(span.start, script.startTime);
    if (inside <= 0) continue;
    const forced = script.duration > 0 ? (inside / script.duration) * script.forcedStyleAndLayoutDuration : 0;
    summary = {
      longest: inside > longestInside ? script : summary.longest,
      scriptTime: summary.scriptTime + inside - forced,
      forcedStyleAndLayout: summary.forcedStyleAndLayout + forced,
      styleAndLayout: summary.styleAndLayout + forced,
    };
    longestInside = Math.max(longestInside, inside);
  }
  return summary;
}
