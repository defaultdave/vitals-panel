import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { VitalsPanelOptions } from "./mountVitalsPanel";
import { mountVitalsPanel } from "./mountVitalsPanel";

let unmount = () => {};

function mount(options?: VitalsPanelOptions) {
  unmount = mountVitalsPanel(options);
  // Queries on `screen` stop at the shadow root, so they start inside it.
  const panel = document.querySelector("vitals-panel")?.shadowRoot?.querySelector("aside");
  if (!panel) throw new Error("The panel did not mount.");
  return within(panel);
}

afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

it("copies the report to the clipboard and says so", async () => {
  const user = userEvent.setup();
  const panel = mount();

  await user.click(panel.getByRole("button", { name: "Copy" }));

  expect(await panel.findByRole("button", { name: "Copied" })).toBeTruthy();
  expect(panel.getByRole("status").textContent).toBe("Vitals copied to the clipboard");
  expect(await navigator.clipboard.readText()).toContain("Page view (web-vitals)");
});

it.each([
  ["copies through a textarea, and takes it away again,", true, "Copied", "Vitals copied to the clipboard"],
  ["says so", false, "Failed", "The copy failed"],
])("%s when the Clipboard API refuses and the older way returns %s", async (_, copied, label, message) => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Refused."));
  // jsdom has no execCommand. A browser has one, and it returns false when it refuses.
  document.execCommand = () => copied;
  const panel = mount();

  await user.click(panel.getByRole("button", { name: "Copy" }));

  expect(await panel.findByRole("button", { name: label })).toBeTruthy();
  expect(panel.getByRole("status").textContent).toBe(message);
  expect(document.querySelector("vitals-panel")?.shadowRoot?.querySelector("textarea")).toBeNull();
});

it("hides the readings when the toggle is pressed, and starts hidden when asked to", async () => {
  const user = userEvent.setup();
  const panel = mount();

  await user.click(panel.getByRole("button", { name: "Vitals (hide)", expanded: true }));

  expect(panel.getByRole("button", { name: "Vitals (show)", expanded: false })).toBeTruthy();
  expect(panel.queryByRole("group", { name: "Since reset" })).toBeNull();

  unmount();
  expect(mount({ open: false }).queryByRole("group", { name: "Since reset" })).toBeNull();
});

it("gives every row and both sections an info button that opens a description", () => {
  const panel = mount();
  const about = (name: string) => {
    const button = panel.getByRole("button", { name: `About ${name}` });
    return (button.getRootNode() as ShadowRoot).getElementById(button.getAttribute("popovertarget") ?? "");
  };

  expect(panel.getAllByRole("button", { name: /^About / })).toHaveLength(11);
  expect(about("INP")?.textContent).toMatch(/^Interaction to Next Paint/);
  expect(about("worst frame")?.getAttribute("popover")).toBe("auto");
  expect(about("Since reset")?.textContent).toMatch(/^The panel's own reading/);
});

it("removes the panel when the returned function is called", () => {
  mount();
  unmount();
  expect(document.querySelector("vitals-panel")).toBeNull();
});
