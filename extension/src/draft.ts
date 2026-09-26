/**
 * Rules for the title the user is typing in Google's event dialog or full
 * editor, and for matching the chip that appears when they save it.
 * Checked on calendar.google.com (September 2026): the quick-create dialog's
 * title field is labeled "Add title", the full editor's is labeled "Title"
 * (id xTiIn), and each is the first text field of its form.
 */

export function norm(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** True for the title field of Google's event dialog or full event editor. */
export function isTitleField(el: EventTarget | null, pathname: string = location.pathname): boolean {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
  if (el instanceof HTMLInputElement && el.type && el.type !== "text") return false;
  const label = `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("placeholder") ?? ""}`;
  if (/\btitle\b/i.test(label)) return true;
  // Other languages: the first text field of the event dialog or the full editor.
  const scope: ParentNode | null = el.closest('[role="dialog"]') ?? (pathname.includes("/eventedit") ? el.ownerDocument : null);
  if (!scope) return false;
  return scope.querySelector('input[type="text"], input:not([type]), textarea') === el;
}

/** Google lists ", Color: <name>," in a chip's text when the event has its own color. */
export function hasOwnColor(chipText: string): boolean {
  return /,\s*color:\s*[^,]+,/i.test(chipText);
}

/** True when a freshly drawn chip is the event the user just typed. */
export function chipMatchesDraft(chipText: string, draftTitle: string): boolean {
  const title = norm(draftTitle);
  return Boolean(title) && norm(chipText).includes(title) && !hasOwnColor(chipText);
}
