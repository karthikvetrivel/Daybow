// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { defaultUserLabels, type UserLabel } from "../lib/taxonomy";
import { mountCategoryCalendar, type CategoryCalendar, type SaveResult } from "../ui/category-calendar";

const wed = () => new Date(2026, 8, 30, 15, 0);
let root: HTMLElement;
let editor: CategoryCalendar;
type Save = (labels: UserLabel[] | undefined) => Promise<SaveResult>;
let save: Mock<Save>;
let changes: UserLabel[][];

function mount(opts: { labels?: UserLabel[]; readOnly?: boolean } = {}) {
  editor = mountCategoryCalendar(root, {
    labels: opts.labels ?? defaultUserLabels(),
    readOnly: opts.readOnly,
    save,
    onChange: (l) => changes.push(l),
    now: wed,
    colorSaveDelayMs: 5,
  });
}

const chips = (key?: string) => Array.from(root.querySelectorAll<HTMLElement>(".dbw-chip[data-key]")).filter((c) => !key || c.dataset.key === key);
const card = () => document.querySelector<HTMLElement>(".dbw-pop");
const input = (sel: string) => card()!.querySelector<HTMLInputElement>(sel)!;
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
function key(el: Element, k: string) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
}
const lastSaved = () => save.mock.calls.at(-1)?.[0];

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div><div id="outside">outside</div>';
  root = document.getElementById("root")!;
  save = vi.fn<Save>(async () => ({ ok: true }));
  changes = [];
});
afterEach(() => editor?.destroy());

describe("categories editor", () => {
  it("draws a Monday-first week with every category as events", () => {
    mount();
    const days = root.querySelectorAll(".dbw-day");
    expect(days).toHaveLength(7);
    expect(days[0].querySelector(".dbw-dow")?.textContent).toBe("Mon");
    expect(days[2].classList.contains("today")).toBe(true);
    expect(days[2].querySelector(".dbw-date")?.textContent).toBe("30");
    expect(chips()).toHaveLength(27);
    expect(root.querySelectorAll(".dbw-pill[data-key]")).toHaveLength(9);
    expect(chips("social")[0].getAttribute("aria-label")).toMatch(/Social$/);
  });

  it("opens an event-style card for the clicked event's category", () => {
    mount();
    chips("social")[0].click();
    expect(card()).not.toBeNull();
    expect(input(".dbw-name").value).toBe("Social");
    expect(root.classList.contains("spot")).toBe(true);
    expect(chips("social").every((c) => c.classList.contains("on"))).toBe(true);
    expect(card()!.querySelector('.dbw-sw[aria-checked="true"]')?.getAttribute("aria-label")).toBe("Butter");
  });

  it("recolors every event of the category at once and saves the pick", async () => {
    mount();
    chips("social")[0].click();
    card()!.querySelector<HTMLElement>('.dbw-sw[data-hex="#ffa6d6"]')!.click();
    expect(chips("social").every((c) => c.style.getPropertyValue("--c") === "#ffa6d6")).toBe(true);
    expect(chips("meeting").every((c) => c.style.getPropertyValue("--c") === "#a8d1ff")).toBe(true);
    await editor.settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(lastSaved()!.find((l) => l.key === "social")?.color).toBe("#ffa6d6");
    expect(document.querySelector(".dbw-snack")?.textContent).toBe("Social is now Bubblegum.");
  });

  it("saves a rename, a description, and a new example title when the card closes", async () => {
    mount();
    chips("fitness")[0].click();
    type(input(".dbw-name"), "Workouts");
    type(card()!.querySelector("textarea")!, "Any exercise");
    const typed = input(".dbw-exin");
    type(typed, "Spin class");
    key(typed, "Enter");
    expect(Array.from(card()!.querySelectorAll(".dbw-tag")).some((t) => t.textContent?.includes("Spin class"))).toBe(true);
    card()!.querySelector<HTMLElement>(".dbw-done")!.click();
    expect(card()).toBeNull();
    await editor.settle();
    const fitness = lastSaved()!.find((l) => l.key === "fitness")!;
    expect(fitness).toMatchObject({ name: "Workouts", what: "Any exercise" });
    expect(fitness.examples).toContain("Spin class");
    expect(root.querySelector('.dbw-pill[data-key="fitness"]')?.textContent).toBe("Workouts");
  });

  it("adds a category from an empty spot in a day, like creating an event", async () => {
    mount();
    const friday = root.querySelectorAll<HTMLElement>(".dbw-day")[4];
    friday.querySelector<HTMLElement>(".dbw-events")!.click();
    expect(root.querySelector(".dbw-chip.draft")?.textContent).toContain("(No title)");
    const name = input(".dbw-name");
    type(name, "Book club");
    expect(root.querySelector(".dbw-chip.draft .t")?.textContent).toBe("Book club");
    key(name, "Enter");
    await editor.settle();
    const created = lastSaved()!.at(-1)!;
    expect(created).toMatchObject({ key: "book_club", name: "Book club", color: "#ffa6d6" });
    const fridayChips = Array.from(root.querySelectorAll<HTMLElement>(".dbw-day")[4].querySelectorAll<HTMLElement>(".dbw-chip"));
    expect(fridayChips.some((c) => c.dataset.key === "book_club")).toBe(true);
    expect(changes.at(-1)).toHaveLength(10);
  });

  it("discards a new category on Escape and on a click outside with no name", () => {
    mount();
    root.querySelector<HTMLElement>('.dbw-pill[data-act="new"]')!.click();
    expect(card()).not.toBeNull();
    key(document.body, "Escape");
    expect(card()).toBeNull();
    expect(root.querySelector(".dbw-chip.draft")).toBeNull();
    root.querySelectorAll<HTMLElement>(".dbw-day")[1].querySelector<HTMLElement>(".dbw-events")!.click();
    document.getElementById("outside")!.click();
    expect(card()).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps the card open and explains when a change is not valid", () => {
    mount();
    chips("focus")[0].click();
    type(input(".dbw-name"), "Meeting");
    card()!.querySelector<HTMLElement>(".dbw-done")!.click();
    expect(card()).not.toBeNull();
    expect(card()!.querySelector(".dbw-err")?.textContent).toMatch(/named "Meeting"/);
    expect(save).not.toHaveBeenCalled();
  });

  it("asks before it removes a category", async () => {
    mount();
    chips("meeting")[0].click();
    card()!.querySelector<HTMLElement>('[aria-label="Remove category"]')!.click();
    expect(card()!.textContent).toContain("Remove Meeting?");
    Array.from(card()!.querySelectorAll<HTMLElement>("button")).find((b) => b.textContent === "Remove")!.click();
    await editor.settle();
    expect(lastSaved()!.some((l) => l.key === "meeting")).toBe(false);
    expect(chips("meeting")).toHaveLength(0);
  });

  it("closes the card on a click outside without creating a category", async () => {
    mount();
    chips("travel")[0].click();
    type(input(".dbw-name"), "Trips");
    root.querySelectorAll<HTMLElement>(".dbw-day")[6].querySelector<HTMLElement>(".dbw-events")!.click();
    expect(card()).toBeNull();
    await editor.settle();
    expect(save).toHaveBeenCalledTimes(1);
    expect(lastSaved()).toHaveLength(9);
    expect(lastSaved()!.find((l) => l.key === "travel")?.name).toBe("Trips");
  });

  it("resets to the defaults after a confirmation", async () => {
    mount({ labels: [{ key: "work", name: "Work", color: "#ffb7b2", what: "", examples: [] }] });
    Array.from(root.querySelectorAll<HTMLElement>(".dbw-footer button")).find((b) => b.textContent === "Reset to defaults")!.click();
    Array.from(root.querySelectorAll<HTMLElement>(".dbw-footer button")).find((b) => b.textContent === "Reset")!.click();
    await editor.settle();
    expect(save).toHaveBeenCalledWith(undefined);
    expect(root.querySelectorAll(".dbw-pill[data-key]")).toHaveLength(9);
  });

  it("only shows the week before sign-in", () => {
    mount({ readOnly: true });
    expect(root.querySelector(".dbw-hint")?.textContent).toMatch(/Sign in/);
    expect(root.querySelector('[data-act="new"]')).toBeNull();
    chips("social")[0].click();
    expect(card()).toBeNull();
  });

  it("puts names and titles on the page as text, never as HTML", () => {
    const evil = "<img src=x onerror=alert(1)>";
    mount({ labels: [{ key: "x", name: evil, color: "#ffb7b2", what: "", examples: [evil] }] });
    expect(root.querySelector("img")).toBeNull();
    expect(chips("x")[0].textContent).toContain(evil);
    chips("x")[0].click();
    expect(card()!.querySelector("img")).toBeNull();
  });
});
