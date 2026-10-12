/**
 * Builds what the panel shows and what the Copy button copies from one
 * snapshot, so the two cannot disagree. Pure functions, no browser APIs.
 */
import type { Interaction, LiveReading } from "./live";
import { rate } from "./live";
import type { Layout, PageReading, Row } from "./rows";
import { ms, PAGE_LAYOUT } from "./rows";

/** One consistent view of both readings. */
export interface VitalsSnapshot {
  page: PageReading;
  live: LiveReading;
}

/** Where and when a report was taken. Read from the browser by the caller. */
export interface ReportEnv {
  url: string;
  userAgent: string;
  /** ISO 8601 time of the copy. */
  capturedAt: string;
  /** `performance.now()` at the copy, to give the live window's length. */
  now: number;
}

// The Core Web Vitals thresholds. A single interaction is rated on the INP scale.
const INP_THRESHOLDS = [200, 500] as const;
const CLS_THRESHOLDS = [0.1, 0.25] as const;

/** Detail labels per live row, fixed so the panel never changes size. */
export const LIVE_LAYOUT: Layout = [
  ["last interaction", ["target", "type", "1 input delay", "2 processing duration", "3 presentation delay"]],
  ["worst interaction", ["target"]],
  ["layout shift", []],
];

function interactionRow(name: string, interaction: Interaction | undefined): Row | undefined {
  if (!interaction) return undefined;
  return {
    name,
    value: ms(interaction.duration),
    rating: rate(interaction.duration, INP_THRESHOLDS),
    details: [
      ["target", interaction.target],
      ["type", interaction.type],
      ["1 input delay", ms(interaction.inputDelay)],
      ["2 processing duration", ms(interaction.processing)],
      ["3 presentation delay", ms(interaction.presentation)],
    ],
  };
}

/**
 * Formats the live reading as rows, keyed by the names in `LIVE_LAYOUT`.
 * @param live - The reading since the last reset.
 * @returns A row per name. An interaction row is missing until one is seen.
 */
export function toLiveRows(live: LiveReading): Record<string, Row | undefined> {
  return {
    "last interaction": interactionRow("last interaction", live.last),
    "worst interaction": interactionRow("worst interaction", live.worst),
    "layout shift": {
      name: "layout shift",
      value: live.shift.toFixed(3),
      rating: rate(live.shift, CLS_THRESHOLDS),
      details: [],
    },
  };
}

function rowLines(name: string, row: Row | undefined, width: number): string[] {
  if (!row) return [`${name.padEnd(width)}  not reported yet`];
  return [
    `${name.padEnd(width)}  ${row.value}  ${row.rating}`,
    ...row.details.map(([label, value]) => `  ${label}: ${value}`),
  ];
}

/**
 * Writes everything the panel knows as plain text, with nothing truncated.
 * @param snapshot - Both readings.
 * @param env - The page URL, user agent and time of the copy.
 * @returns The report, ready for the clipboard.
 */
export function toReportText({ page, live }: VitalsSnapshot, env: ReportEnv): string {
  const liveRows = toLiveRows(live);
  const seconds = ((env.now - live.since) / 1000).toFixed(1);
  return [
    `Web vitals: ${env.url}`,
    `Captured: ${env.capturedAt}`,
    `Navigation: ${page.navigationType}${page.url ? ` to ${page.url}` : ""}`,
    `User agent: ${env.userAgent}`,
    "Lab reading from one page view on this device. Not field data.",
    "",
    "Page view (web-vitals)",
    ...PAGE_LAYOUT.flatMap(([name]) => rowLines(name, page.rows[name], 4)),
    "",
    `Since reset (${live.count} interactions in ${seconds} s)`,
    ...LIVE_LAYOUT.flatMap(([name]) => rowLines(name, liveRows[name], 17)),
  ].join("\n");
}
