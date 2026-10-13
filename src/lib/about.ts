/**
 * What each row and each section is, in a few sentences, for the panel's info
 * buttons. The "good" values are read from `web-vitals`, so they cannot drift
 * from the ratings it gives. Pure data, no browser APIs.
 */
import { CLSThresholds, FCPThresholds, INPThresholds, LCPThresholds, TTFBThresholds } from "web-vitals/attribution";
import { ms } from "./rows";

/** The two sections of the panel. */
export const SECTION_ABOUT = {
  page:
    "Core Web Vitals for this page view, from Google's web-vitals library. INP and CLS are the worst so far, so they only go up. Restarts on a navigation.",
  live:
    "The panel's own reading of the same browser entries since Reset was last pressed. Press Reset, interact, and read one change at a time. The number is how many interactions were counted.",
};

/** A description per row, keyed by the names in `PAGE_LAYOUT` and `LIVE_LAYOUT`. */
export const ROW_ABOUT: Record<string, string> = {
  TTFB: `Time to First Byte: from the start of the navigation to the first byte of the response. Good is ${ms(TTFBThresholds[0])} or less.`,
  FCP: `First Contentful Paint: when the first text or image appeared. Good is ${ms(FCPThresholds[0])} or less.`,
  LCP: `Largest Contentful Paint: when the largest image or block of text in the viewport appeared. Good is ${ms(LCPThresholds[0])} or less. Parts 1 to 4 add up to it.`,
  INP: `Interaction to Next Paint: the slowest click, tap or key press so far, from the input to the next frame on screen. One is skipped for every 50. Good is ${ms(INPThresholds[0])} or less. Parts 1 to 3 add up to it. The last three lines come from long animation frames. A value marked (panel) was matched by the panel, because web-vitals reported before the browser delivered the frame.`,
  CLS: `Cumulative Layout Shift: how far visible content moved without input, as the largest burst of shifts so far. Good is ${CLSThresholds[0]} or less. It has no unit.`,
  "last interaction":
    "The most recent click, tap or key press, from the input to the next frame on screen, rated on the INP scale. 1 is the wait for the main thread, 2 is the event handlers, 3 is the rendering. The script lines name the script that ran longest during it, when a frame took over 50 ms.",
  "worst interaction": "The slowest interaction since the reset. Copy includes its parts and its script.",
  "worst frame":
    "The longest long animation frame since the reset: a frame that took over 50 ms from its first task to the end of its rendering, with or without an interaction. Blocking duration is the part of each task past 50 ms. A frame has no rating.",
  "layout shift": "The largest burst of layout shifts since the reset, scored the way CLS is.",
};
