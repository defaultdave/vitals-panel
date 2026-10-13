/**
 * The page-load reading: turns each `web-vitals` metric into a display row and
 * keeps one set of rows per navigation.
 *
 * The rows are `web-vitals` output, with one exception. The library reports INP
 * once per value, and the browser can deliver the interaction's long animation
 * frame a few milliseconds later, which leaves the three script lines empty.
 * The panel then fills them from its own frames and marks each value "(panel)".
 * Pure functions, no browser APIs.
 */
import type {
  CLSMetricWithAttribution,
  FCPMetricWithAttribution,
  INPMetricWithAttribution,
  LCPMetricWithAttribution,
  TTFBMetricWithAttribution,
} from "web-vitals/attribution";
import type { FrameEntry, Span } from "./frames";
import { describeSource, keepFrames, scriptsDuring } from "./frames";

/** Any metric the attribution build of `web-vitals` reports. */
export type VitalsMetric =
  | CLSMetricWithAttribution
  | FCPMetricWithAttribution
  | INPMetricWithAttribution
  | LCPMetricWithAttribution
  | TTFBMetricWithAttribution;

/** A threshold rating, or "none" before a value exists. */
export type Rating = "good" | "needs-improvement" | "poor" | "none";

/** One metric as the panel and the copied report show it. */
export interface Row {
  name: string;
  value: string;
  rating: Rating;
  details: [label: string, value: string][];
}

/** The rows for one navigation: a page load, a bfcache restore or a soft navigation. */
export interface PageReading {
  /** When the navigation started, in ms since the time origin. 0 for the page load. */
  startTime: number;
  navigationType: string;
  url: string | undefined;
  rows: Record<string, Row>;
  /** The INP interaction, from its start to the end of its handlers, while `web-vitals` has named no frame for it. */
  inpSpan: Span | undefined;
  /** The newest long animation frames, and the ones in `inpSpan`, kept to fill the INP row's script lines. */
  frames: readonly FrameEntry[];
}

export const EMPTY_PAGE: PageReading = {
  startTime: 0,
  navigationType: "navigate",
  url: undefined,
  rows: {},
  inpSpan: undefined,
  frames: [],
};

/** The rows of one section, in order, each with the labels of its detail lines. */
export type Layout = [name: string, detailLabels: string[]][];

/**
 * Every row is rendered from the first paint and filled in later, so the panel
 * never changes size and adds no layout shift of its own.
 */
export const PAGE_LAYOUT: Layout = [
  ["TTFB", []],
  ["FCP", []],
  ["LCP", ["element", "1 time to first byte", "2 resource load delay", "3 resource load duration", "4 element render delay"]],
  [
    "INP",
    [
      "target",
      "type",
      "1 input delay",
      "2 processing duration",
      "3 presentation delay",
      "longest script",
      "script time",
      "style and layout",
    ],
  ],
  ["CLS", ["largest shift", "its value", "at"]],
];

/**
 * Formats a duration for display.
 * @param n - Milliseconds, or undefined when the browser did not report one.
 * @returns Whole milliseconds with the unit, or "n/a".
 */
export const ms = (n: number | undefined) => (n === undefined ? "n/a" : `${Math.round(n)} ms`);

/**
 * Formats one `web-vitals` metric as a row, with its attribution as details.
 * @param metric - A metric as passed to a `web-vitals` callback.
 * @returns The row for the panel and the report.
 */
export function toRow(metric: VitalsMetric): Row {
  const base = { name: metric.name, rating: metric.rating };
  switch (metric.name) {
    case "LCP": {
      const a = metric.attribution;
      return {
        ...base,
        value: ms(metric.value),
        details: [
          ["element", a.target ?? "n/a"],
          ["1 time to first byte", ms(a.timeToFirstByte)],
          ["2 resource load delay", ms(a.resourceLoadDelay)],
          ["3 resource load duration", ms(a.resourceLoadDuration)],
          ["4 element render delay", ms(a.elementRenderDelay)],
        ],
      };
    }
    case "INP": {
      const a = metric.attribution;
      return {
        ...base,
        value: ms(metric.value),
        details: [
          ["target", a.interactionTarget ?? "n/a"],
          ["type", a.interactionType ?? "n/a"],
          ["1 input delay", ms(a.inputDelay)],
          ["2 processing duration", ms(a.processingDuration)],
          ["3 presentation delay", ms(a.presentationDelay)],
          ["longest script", describeSource(a.longestScript?.entry)],
          ["script time", ms(a.totalScriptDuration)],
          ["style and layout", ms(a.totalStyleAndLayoutDuration)],
        ],
      };
    }
    case "CLS": {
      const a = metric.attribution;
      return {
        ...base,
        value: metric.value.toFixed(3),
        details: [
          ["largest shift", a.largestShiftTarget ?? "n/a"],
          ["its value", a.largestShiftValue?.toFixed(3) ?? "n/a"],
          ["at", ms(a.largestShiftTime)],
        ],
      };
    }
    default:
      return { ...base, value: ms(metric.value), details: [] };
  }
}

// Appended to a value the panel worked out, in a row that is otherwise `web-vitals` output.
const PANEL_MARK = " (panel)";

function unnamedSpan(metric: INPMetricWithAttribution): Span | undefined {
  const a = metric.attribution;
  // An INP with no event entry behind it has no time to match a frame against.
  if (a.longAnimationFrameEntries.length > 0 || a.interactionTime === undefined) return undefined;
  return { start: a.interactionTime, end: a.interactionTime + a.inputDelay + a.processingDuration };
}

function fillInpScripts(page: PageReading): PageReading {
  const row = page.rows.INP;
  const scripts = page.inpSpan && scriptsDuring(page.frames, page.inpSpan);
  if (!row || !scripts) return page;
  const filled = new Map([
    ["longest script", describeSource(scripts.longest)],
    ["script time", ms(scripts.scriptTime)],
    ["style and layout", ms(scripts.styleAndLayout)],
  ]);
  const details = row.details.map(([label, value]): [string, string] => {
    const own = filled.get(label);
    return [label, own === undefined ? value : `${own}${PANEL_MARK}`];
  });
  return { ...page, rows: { ...page.rows, INP: { ...row, details } } };
}

/**
 * Adds a batch of long animation frames to the page reading, and fills the INP
 * row's script lines from them when `web-vitals` reported INP without a frame.
 * @param page - The current reading.
 * @param entries - Frames from one observer callback.
 * @returns The next reading.
 */
export function addPageFrames(page: PageReading, entries: FrameEntry[]): PageReading {
  const frames = keepFrames([...page.frames, ...entries], page.inpSpan ? [page.inpSpan] : []);
  return fillInpScripts({ ...page, frames });
}

/**
 * Adds a reported metric to the page reading. A metric from a newer navigation
 * (a soft navigation or a bfcache restore) starts a fresh set of rows. A late
 * final report for the navigation before the current one is dropped.
 * @param page - The current reading.
 * @param metric - A metric as passed to a `web-vitals` callback.
 * @returns The next reading, or the same object when the metric is stale.
 */
export function applyMetric(page: PageReading, metric: VitalsMetric): PageReading {
  const startTime = metric.navigationStartTime ?? 0;
  if (startTime < page.startTime) return page;
  // A newer navigation starts without the rows of the one before, or the interaction its INP was waiting on.
  const { rows, inpSpan } = startTime > page.startTime ? EMPTY_PAGE : page;
  return fillInpScripts({
    startTime,
    navigationType: metric.navigationType,
    url: metric.navigationURL,
    rows: { ...rows, [metric.name]: toRow(metric) },
    inpSpan: metric.name === "INP" ? unnamedSpan(metric) : inpSpan,
    frames: page.frames,
  });
}
