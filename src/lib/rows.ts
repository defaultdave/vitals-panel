/**
 * The page-load reading: turns each `web-vitals` metric into a display row and
 * keeps one set of rows per navigation. Pure functions, no browser APIs.
 */
import type {
  CLSMetricWithAttribution,
  FCPMetricWithAttribution,
  INPMetricWithAttribution,
  LCPMetricWithAttribution,
  TTFBMetricWithAttribution,
} from "web-vitals/attribution";

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
}

export const EMPTY_PAGE: PageReading = {
  startTime: 0,
  navigationType: "navigate",
  url: undefined,
  rows: {},
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
  ["INP", ["target", "type", "1 input delay", "2 processing duration", "3 presentation delay", "script time", "style and layout"]],
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
  const rows = startTime > page.startTime ? {} : page.rows;
  return {
    startTime,
    navigationType: metric.navigationType,
    url: metric.navigationURL,
    rows: { ...rows, [metric.name]: toRow(metric) },
  };
}
