function copyThroughTextarea(text: string, root: ShadowRoot): boolean {
  const focused = root.activeElement;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.className = "copyBuffer";
  root.append(area);
  try {
    area.select();
    // Deprecated, and still the only way to copy when the async API is missing or refused.
    return document.execCommand("copy");
  } finally {
    area.remove();
    // Selecting took the focus, and removing the textarea would leave it on the body.
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
  }
}

/**
 * Copies text to the clipboard.
 *
 * The async Clipboard API exists only in a secure context, and an embedded
 * browser can refuse it. A phone loading a dev server over a LAN address has
 * no secure context, and that is where this panel gets used, so a refusal
 * falls back to copying from a temporary textarea.
 * @param text - The text to copy.
 * @param root - The panel's shadow root. The temporary textarea goes there, where the panel's stylesheet keeps it out of sight.
 * @throws When the browser refuses both ways.
 */
export async function copyText(text: string, root: ShadowRoot): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (cause) {
    if (!copyThroughTextarea(text, root)) throw new Error("The browser refused to copy.", { cause });
  }
}
