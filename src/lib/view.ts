/**
 * Turns a snapshot into the text of every cell the panel draws. Each row in a
 * layout table is in the result whether or not its metric has reported, so the
 * panel is the same size from the first paint. Pure functions, no browser APIs.
 */
import type { VitalsSnapshot } from "./report";
import { LIVE_LAYOUT, toLiveRows } from "./report";
import type { Layout, Rating, Row } from "./rows";
import { PAGE_LAYOUT } from "./rows";

/** One detail line under a metric. */
export interface DetailView {
  label: string;
  /** The value, or a dash before there is one. The panel cuts it off when it is too long. */
  text: string;
  /** The value in full, for the tooltip. Empty before there is one. */
  title: string;
}

/** One metric as the panel draws it. */
export interface MetricView {
  name: string;
  /** The formatted value, or what to do to get one. */
  value: string;
  rating: Rating;
  details: DetailView[];
}

/** Everything in the panel that changes as readings arrive. */
export interface PanelView {
  page: MetricView[];
  liveHeading: string;
  live: MetricView[];
}

const NO_DETAIL = "-";

// INP has no value until the first click, tap or key press.
const pageWaiting = (name: string) => (name === "INP" ? "interact first" : "waiting");
const liveWaiting = () => "interact";

function toMetricViews(
  layout: Layout,
  rows: Record<string, Row | undefined>,
  waiting: (name: string) => string,
): MetricView[] {
  return layout.map(([name, labels]) => {
    const row = rows[name];
    const details = new Map(row?.details);
    return {
      name,
      value: row?.value ?? waiting(name),
      rating: row?.rating ?? "none",
      details: labels.map((label) => ({
        label,
        text: details.get(label) ?? NO_DETAIL,
        title: details.get(label) ?? "",
      })),
    };
  });
}

/**
 * Lays both readings out as the panel draws them.
 * @param snapshot - Both readings.
 * @returns A view with the same rows and detail lines for every snapshot.
 */
export function toPanelView({ page, live }: VitalsSnapshot): PanelView {
  return {
    page: toMetricViews(PAGE_LAYOUT, page.rows, pageWaiting),
    liveHeading: `Since reset (${live.count})`,
    live: toMetricViews(LIVE_LAYOUT, toLiveRows(live), liveWaiting),
  };
}
