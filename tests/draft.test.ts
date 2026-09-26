// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { chipMatchesDraft, hasOwnColor, isTitleField } from "../extension/src/draft";

function field(html: string, selector: string): Element {
  document.body.innerHTML = html;
  return document.querySelector(selector)!;
}

describe("isTitleField", () => {
  it("finds the quick-create dialog's title field", () => {
    const el = field(`<div role="dialog"><input type="text" aria-label="Add title" placeholder="Add title"><input type="text" aria-label="Start date"></div>`, "input");
    expect(isTitleField(el, "/calendar/u/0/r/week")).toBe(true);
    expect(isTitleField(document.querySelectorAll("input")[1], "/calendar/u/0/r/week")).toBe(false);
  });

  it("finds the full editor's title field", () => {
    const el = field(`<input type="text" id="xTiIn" aria-label="Title" placeholder="Add title"><input type="text" aria-label="Guests">`, "#xTiIn");
    expect(isTitleField(el, "/calendar/u/0/r/eventedit")).toBe(true);
  });

  it("falls back to the first field of the dialog in other languages", () => {
    const el = field(`<div role="dialog"><input type="text" aria-label="Titel hinzufügen"><input type="text" aria-label="Startdatum"></div>`, "input");
    expect(isTitleField(el, "/calendar/u/0/r/week")).toBe(true);
  });

  it("ignores the people search box and non-text inputs", () => {
    expect(isTitleField(field(`<input type="text" aria-label="Search for people">`, "input"), "/calendar/u/0/r/week")).toBe(false);
    expect(isTitleField(field(`<div role="dialog"><input type="checkbox" aria-label="Title"></div>`, "input"), "/calendar/u/0/r/week")).toBe(false);
  });
});

describe("chip matching", () => {
  it("matches the typed title and skips events that already have a color", () => {
    const text = "3pm to 4pm, Dinner with Sam, Alex Doe, No location, October 6, 2026Dinner with Sam3 – 4pm";
    expect(chipMatchesDraft(text, "Dinner  with sam")).toBe(true);
    expect(chipMatchesDraft(text, "Lunch")).toBe(false);
    const colored = "3pm to 4pm, Dinner with Sam, Alex Doe, No location, Color: Social, October 6, 2026";
    expect(hasOwnColor(colored)).toBe(true);
    expect(chipMatchesDraft(colored, "Dinner with Sam")).toBe(false);
    expect(hasOwnColor("3pm to 4pm, Color test: tennis with Alex, Alex Doe, No location, September 28, 2026")).toBe(false);
  });
});
