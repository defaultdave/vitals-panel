/**
 * The panel: plain DOM in a shadow root, with its stylesheet bundled in.
 *
 * It holds no measuring logic. `lib/store` owns the readings and `lib/view`
 * decides the text of every cell. This file builds each element once, from the
 * first view, and afterwards only changes the data of text nodes that already
 * exist, and only while the panel is open. Nothing is added or removed as values arrive, so the panel stays one
 * size and adds no layout shift to the page it is measuring.
 *
 * Each row and each section has an info button that opens a description of it.
 * The description is a popover: the browser draws it above the page, outside
 * the panel's box, so opening one changes nothing about the panel's layout.
 */
import { SECTION_ABOUT } from "./lib/about";
import { copyText } from "./lib/clipboard";
import { toReportText } from "./lib/report";
import type { VitalsMetric } from "./lib/rows";
import { getVitals, ignoreInteractionsWith, onVitalsMetric, resetLive, subscribeVitals } from "./lib/store";
import type { MetricView } from "./lib/view";
import { toPanelView } from "./lib/view";
import css from "./mountVitalsPanel.css?inline";

/** Options for {@link mountVitalsPanel}. */
export interface VitalsPanelOptions {
  /** Whether the panel starts expanded. Defaults to true. */
  open?: boolean;
  /** Logs every `web-vitals` metric, with its full attribution object, to the console. Defaults to false. */
  log?: boolean;
}

type CopyStatus = "idle" | "copied" | "failed";

const COPY_VIEW: Record<CopyStatus, { label: string; message: string }> = {
  idle: { label: "Copy", message: "" },
  copied: { label: "Copied", message: "Vitals copied to the clipboard" },
  failed: { label: "Failed", message: "The copy failed" },
};
const COPY_STATUS_MS = 2000;
const TOGGLE_LABEL = { open: "Vitals (hide)", closed: "Vitals (show)" };
// A tag of its own, so page rules written for `div` or `aside` miss it. The hyphen lets it hold a shadow root.
const HOST_TAG = "vitals-panel";

const logMetric = (metric: VitalsMetric) => console.log(`[vitals] ${metric.name}`, metric.value, metric.attribution);

function el<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  attributes: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

function setText(node: Text, text: string) {
  if (node.data !== text) node.data = text;
}

function adoptStyles(root: ShadowRoot) {
  // A constructed sheet passes a Content Security Policy that refuses <style> elements.
  if ("adoptedStyleSheets" in Document.prototype && "replaceSync" in CSSStyleSheet.prototype) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
  } else {
    root.append(el("style", {}, css));
  }
}

// The button opens the note without any script: `popovertarget` names it, and the browser closes it on Escape or a click elsewhere.
// The id only has to be unique in this panel's shadow root, which is where the browser looks it up.
function infoFor(name: string, about: string): [button: HTMLElement, note: HTMLElement] {
  const id = `about-${name.replaceAll(" ", "-")}`;
  return [
    el("button", { type: "button", class: "info", popovertarget: id, "aria-label": `About ${name}` }, "i"),
    el("div", { id, class: "about", popover: "auto" }, about),
  ];
}

type Fill<View> = (view: View) => void;

function metricRow(view: MetricView): [row: HTMLElement, fill: Fill<MetricView>] {
  const value = new Text();
  const valueCell = el("span", { class: "value" }, value);
  const details = view.details.map(({ label }) => {
    const text = new Text();
    const cell = el("span", {}, text);
    return { text, cell, line: el("dd", {}, el("span", {}, label), cell) };
  });
  const fill: Fill<MetricView> = (next) => {
    setText(value, next.value);
    if (valueCell.dataset.rating !== next.rating) valueCell.dataset.rating = next.rating;
    next.details.forEach(({ text, title }, index) => {
      const detail = details[index];
      if (!detail) return;
      setText(detail.text, text);
      if (detail.cell.title !== title) detail.cell.title = title;
    });
  };
  fill(view);
  const [info, note] = infoFor(view.name, view.about);
  const heading = el("dt", {}, el("span", { class: "name" }, view.name, info), valueCell, note);
  return [el("div", { class: "metric" }, heading, ...details.map((d) => d.line)), fill];
}

function metricList(views: MetricView[]): [list: HTMLElement, fill: Fill<MetricView[]>] {
  const rows = views.map(metricRow);
  return [
    el("dl", { class: "list" }, ...rows.map(([row]) => row)),
    (next) => next.forEach((view, index) => rows[index]?.[1](view)),
  ];
}

/**
 * Adds the panel to the page: a fixed overlay with two readings for the
 * current page view.
 *
 * "Page view" is Google's `web-vitals` library, attribution build: TTFB, FCP,
 * LCP, INP and CLS as Chrome defines them. INP and CLS there are the worst seen
 * so far, so a good reading after a bad one changes nothing, and they restart on a navigation.
 *
 * "Since reset" is the panel's own window over the same browser entries: the
 * last interaction, the worst one, the longest long animation frame and the
 * layout shift since Reset was pressed.
 *
 * Both are lab readings on this device, not field data. Mount one panel per
 * page. On a server, where there is no document, this does nothing.
 * @param options - Whether the panel starts open, and whether metrics are logged.
 * @returns A function that removes the panel. Measuring carries on for the page view.
 */
export function mountVitalsPanel({ open = true, log = false }: VitalsPanelOptions = {}): () => void {
  if (typeof document === "undefined") return () => {};

  const view = toPanelView(getVitals());
  const [pageList, fillPage] = metricList(view.page);
  const [liveList, fillLive] = metricList(view.live);
  const liveHeading = new Text(view.liveHeading);
  const toggleLabel = new Text();
  const copyLabel = new Text();
  const statusMessage = new Text();

  const [pageInfo, pageNote] = infoFor("Page view", SECTION_ABOUT.page);
  const [liveInfo, liveNote] = infoFor("Since reset", SECTION_ABOUT.live);

  const toggle = el("button", { type: "button", class: "toggle" }, toggleLabel);
  const copy = el("button", { type: "button", class: "action copy" }, copyLabel);
  const reset = el("button", { type: "button", class: "action" }, "Reset");
  const readings = el(
    "div",
    {},
    el(
      "div",
      { role: "group", "aria-label": "Page view, from web-vitals" },
      el("div", { class: "heading" }, el("span", { class: "name" }, "Page view", pageInfo), pageNote),
      pageList,
    ),
    el(
      "div",
      { role: "group", "aria-label": "Since reset" },
      el("div", { class: "heading" }, el("span", { class: "name" }, liveHeading, liveInfo), liveNote, reset),
      liveList,
    ),
  );
  // Groups with labels, not headings: the panel sits inside someone else's page outline.
  const panel = el(
    "aside",
    { class: "panel", "aria-label": "Web vitals for this page view" },
    el("div", { class: "bar" }, toggle, copy),
    el("span", { role: "status", class: "srOnly" }, statusMessage),
    readings,
  );

  const host = document.createElement(HOST_TAG);
  const root = host.attachShadow({ mode: "open" });
  adoptStyles(root);
  root.append(panel);

  // A collapsed panel does no work as readings arrive. It catches up when it opens.
  function showVitals() {
    if (readings.hidden) return;
    const next = toPanelView(getVitals());
    fillPage(next.page);
    setText(liveHeading, next.liveHeading);
    fillLive(next.live);
  }

  function showOpen(next: boolean) {
    toggle.setAttribute("aria-expanded", String(next));
    setText(toggleLabel, next ? TOGGLE_LABEL.open : TOGGLE_LABEL.closed);
    readings.hidden = !next;
    showVitals();
  }

  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  function showCopyStatus(status: CopyStatus) {
    clearTimeout(copyTimer);
    setText(copyLabel, COPY_VIEW[status].label);
    setText(statusMessage, COPY_VIEW[status].message);
    if (status !== "idle") copyTimer = setTimeout(showCopyStatus, COPY_STATUS_MS, "idle");
  }

  async function copyReport() {
    const report = toReportText(getVitals(), {
      url: window.location.href,
      userAgent: navigator.userAgent,
      capturedAt: new Date().toISOString(),
      now: performance.now(),
    });
    let status: CopyStatus = "copied";
    try {
      await copyText(report, root);
    } catch {
      status = "failed";
    }
    // The panel can be unmounted while the browser is still deciding.
    if (host.isConnected) showCopyStatus(status);
  }

  showOpen(open);
  showCopyStatus("idle");
  toggle.addEventListener("click", () => showOpen(readings.hidden === true));
  copy.addEventListener("click", () => void copyReport());
  reset.addEventListener("click", resetLive);

  const stops = [ignoreInteractionsWith(host), subscribeVitals(showVitals)];
  if (log) stops.push(onVitalsMetric(logMetric));
  // The first subscription starts the measuring, and a metric can report before the listener is in place.
  showVitals();

  // A classic script in the head runs before the body exists.
  (document.body ?? document.documentElement).append(host);

  return () => {
    for (const stop of stops) stop();
    clearTimeout(copyTimer);
    host.remove();
  };
}
