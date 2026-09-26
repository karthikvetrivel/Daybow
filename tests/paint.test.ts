// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { Painter, chipCalendar, chipEventId, parseColor, sameColor, textColorFor, tint } from "../extension/src/paint";

const RED = "rgb(213, 0, 0)";
const MINT = "#b5ead7";
const b64 = (s: string) => btoa(s).replace(/=+$/, "");

/** A timed week-view chip, as Google Calendar renders it (September 2026). */
function timedChip(id: string, color = RED, cal = "me@m") {
  const eid = b64(`${id} ${cal}`);
  return `<div role="button" data-eventchip="" data-eventid="${eid}" jslog="35463; 2:[&quot;${id}&quot;,null]" class="GTG3wb" style="top: 599px; height: 38px; background-color: ${color}; border-color: ${color};"><div class="XuJrye">3pm to 4pm, Test</div><div aria-hidden="true" class="Jcb6qd"><div class="fFwDnf"><div class="lhydbb" style="max-height: 15px;"><span class="KcY3wb"><span class="I0UMhf">Test</span></span></div><div class="lhydbb">3 – 4pm</div></div></div><div aria-hidden="true" class="leOeGd" data-eventid="${eid}"></div></div>`;
}

/** An all-day chip in the stacked layout. */
function allDayChip(id: string, color = RED) {
  const eid = b64(`${id} me@m`);
  return `<div data-eventchip="" data-stacked-layout-chip-container="true" data-eventid="${eid}" class="vEJ0bc" style="left: 57%; width: 42%; top: 0em; border-color: ${color};"><div role="button" data-stacked-layout-chip="true" class="KF4T6b" style="background-color: ${color};"><div class="PxbABe" aria-hidden="true" style="border-left-color: ${color};"></div><span aria-hidden="true" class="nHqeVd"><span class="WBi6vc">Trip</span></span></div></div>`;
}

/** A month-view timed chip: a dot drawn with border-color, text on the page background. */
function monthDotChip(id: string, dot: string, rootBorder: string) {
  const eid = b64(`${id} me@m`);
  return `<div data-eventchip="" data-stacked-layout-chip-container="true" data-eventid="${eid}" class="vEJ0bc Po94xd" style="left: 14.29%; width: 14.29%; top: 1em; border-color: ${rootBorder};"><div role="button" data-stacked-layout-chip="true" class="KF4T6b smECzc" style=""><div class="ZWOtn"><div class="VlNR9e" style="border-color: ${dot};"></div></div><span aria-hidden="true" class="nHqeVd"><span class="DvyQhe">3pm</span><span class="WBi6vc">Test</span></span></div></div>`;
}

/** A past all-day chip in month view: 30% tint fill, 50% tint border on the root. */
function pastAllDayChip(id: string) {
  const eid = b64(`${id} me@m`);
  return `<div data-eventchip="" data-stacked-layout-chip-container="true" data-eventid="${eid}" class="vEJ0bc Po94xd" style="left: 0%; width: 71.43%; top: 0em; border-color: rgb(234, 128, 128);"><div role="button" data-stacked-layout-chip="true" class="KF4T6b" style="background-color: rgb(242, 179, 179);"><div class="PxbABe" aria-hidden="true" style="border-right-color: rgb(242, 179, 179);"></div><span aria-hidden="true" class="nHqeVd"><span class="WBi6vc">Trip</span></span></div></div>`;
}

function mount(html: string): HTMLElement {
  document.body.innerHTML = `<div id="grid">${html}</div>`;
  return document.querySelector<HTMLElement>("[data-eventchip]")!;
}

/** Google re-renders a chip: a new element replaces the old one. */
function rerender(html: string): HTMLElement {
  document.getElementById("grid")!.innerHTML = html;
  return document.querySelector<HTMLElement>("[data-eventchip]")!;
}

const bg = (el: Element) => (el as HTMLElement).style.getPropertyValue("background-color");

describe("color helpers", () => {
  it("parses and compares css colors", () => {
    expect(parseColor("#b5ead7")).toEqual([181, 234, 215, 1]);
    expect(parseColor("rgb(213, 0, 0)")).toEqual([213, 0, 0, 1]);
    expect(parseColor("rgba(0, 0, 0, 0)")).toEqual([0, 0, 0, 0]);
    expect(sameColor("#b5ead7", "rgb(181, 234, 215)")).toBe(true);
    expect(sameColor(RED, MINT)).toBe(false);
    expect(textColorFor(MINT)).toBe("#1f1f1f");
    expect(textColorFor(RED)).toBe("#ffffff");
  });

  it("reads the event id and calendar from a chip", () => {
    const chip = mount(timedChip("khsgqpou0pcjkmpo9umgtl9ff8"));
    expect(chipEventId(chip)).toBe("khsgqpou0pcjkmpo9umgtl9ff8");
    expect(chipCalendar(chip)).toBe("me@m");
  });
});

describe("Painter", () => {
  let painter: Painter;
  beforeEach(() => {
    painter = new Painter();
  });

  it("paints a timed chip in place with readable text", () => {
    const chip = mount(timedChip("abc"));
    painter.update([{ key: "abc", color: MINT, at: 1 }]);
    expect(painter.apply(chip)).toBe("painted");
    expect(sameColor(bg(chip), MINT)).toBe(true);
    expect(chip.style.getPropertyPriority("background-color")).toBe("important");
    expect(sameColor(chip.style.getPropertyValue("border-color"), MINT)).toBe(true);
    const title = chip.querySelector<HTMLElement>(".I0UMhf")!;
    expect(title.style.getPropertyValue("color")).toBe("#1f1f1f");
    expect(painter.apply(chip)).toBe("kept");
  });

  it("paints an all-day chip: inner button, container border, and arrow", () => {
    const chip = mount(allDayChip("trip1"));
    painter.update([{ key: "trip1", color: MINT, at: 1 }]);
    expect(painter.apply(chip)).toBe("painted");
    const button = chip.querySelector<HTMLElement>("[data-stacked-layout-chip]")!;
    expect(sameColor(bg(button), MINT)).toBe(true);
    expect(sameColor(chip.style.getPropertyValue("border-color"), MINT)).toBe(true);
    expect(sameColor(chip.querySelector<HTMLElement>(".PxbABe")!.style.getPropertyValue("border-left-color"), MINT)).toBe(true);
  });

  it("repaints when Google re-renders the chip with the stale color", () => {
    mount(timedChip("abc"));
    painter.update([{ key: "abc", color: MINT, at: 1 }]);
    painter.applyAll();
    const fresh = rerender(timedChip("abc"));
    expect(sameColor(bg(fresh), RED)).toBe(true);
    expect(painter.apply(fresh)).toBe("painted");
    expect(sameColor(bg(fresh), MINT)).toBe(true);
  });

  it("repaints when Google rewrites the inline style on the same element", () => {
    const chip = mount(timedChip("abc"));
    painter.update([{ key: "abc", color: MINT, at: 1 }]);
    painter.apply(chip);
    chip.style.backgroundColor = RED; // Google's own update drops our !important value
    expect(painter.apply(chip)).toBe("painted");
    expect(sameColor(bg(chip), MINT)).toBe(true);
  });

  it("steps aside once Google shows the color itself", () => {
    mount(timedChip("abc"));
    painter.update([{ key: "abc", color: MINT, at: 1 }]);
    painter.applyAll();
    const caughtUp = rerender(timedChip("abc", "rgb(181, 234, 215)"));
    expect(painter.apply(caughtUp)).toBe("native");
    expect(caughtUp.style.getPropertyPriority("background-color")).toBe("");
    // later stale renders are left alone
    const again = rerender(timedChip("abc"));
    expect(painter.apply(again)).toBe("released");
  });

  it("never fights a color the user picks by hand", () => {
    mount(timedChip("abc"));
    painter.update([{ key: "abc", color: MINT, at: 1 }]);
    painter.applyAll();
    const picked = rerender(timedChip("abc", "rgb(3, 155, 229)"));
    expect(painter.apply(picked)).toBe("released");
    expect(sameColor(bg(picked), "rgb(3, 155, 229)")).toBe(true);
  });

  it("restores text color when a hand-picked color arrives on the same element", () => {
    const chip = mount(timedChip("abc"));
    const label = chip.querySelector<HTMLElement>(".lhydbb")!;
    label.style.setProperty("color", "rgb(255, 255, 255)");
    painter.update([{ key: "abc", color: MINT, at: 1 }]);
    painter.apply(chip);
    expect(label.style.getPropertyValue("color")).toBe("#1f1f1f");
    chip.style.backgroundColor = "rgb(3, 155, 229)";
    expect(painter.apply(chip)).toBe("released");
    expect(label.style.getPropertyValue("color")).toBe("rgb(255, 255, 255)");
    expect(chip.querySelector<HTMLElement>(".I0UMhf")!.style.getPropertyValue("color")).toBe("");
  });

  it("paints every instance of a recurring series from one paint", () => {
    const html = timedChip("series_20261007T150000Z") + timedChip("series_20261008T150000Z");
    document.body.innerHTML = `<div id="grid">${html}</div>`;
    painter.update([{ key: "series", color: MINT, at: 1 }]);
    expect(painter.applyAll()).toBe(2);
    for (const c of Array.from(document.querySelectorAll("[data-eventchip]"))) expect(sameColor(bg(c), MINT)).toBe(true);
  });

  it("ignores chips it has no paint for", () => {
    const chip = mount(timedChip("other"));
    painter.update([{ key: "abc", color: MINT, at: 1 }]);
    expect(painter.apply(chip)).toBe("skipped");
    expect(sameColor(bg(chip), RED)).toBe(true);
  });

  it("a newer paint for the same event replaces the old one", () => {
    const chip = mount(timedChip("abc"));
    painter.update([{ key: "abc", color: MINT, at: 1 }]);
    painter.apply(chip);
    painter.update([{ key: "abc", color: "#ffe08a", at: 2 }]);
    expect(painter.apply(chip)).toBe("painted");
    expect(sameColor(bg(chip), "#ffe08a")).toBe(true);
  });

  it("recolors own-calendar chips after a category recolor, and only those", () => {
    const html = timedChip("mine", "rgb(181, 234, 215)") + timedChip("theirs", "rgb(181, 234, 215)", "family@g");
    document.body.innerHTML = `<div id="grid">${html}</div>`;
    painter.update([], [{ from: "#b5ead7", to: "#ffb7b2", at: 5 }], ["me@example.com", "me@m"]);
    expect(painter.applyAll()).toBe(1);
    const [mine, theirs] = Array.from(document.querySelectorAll("[data-eventchip]"));
    expect(sameColor(bg(mine), "#ffb7b2")).toBe(true);
    expect(sameColor(bg(theirs), "#b5ead7")).toBe(true);
  });

  it("applies a category recolor made after an event was labeled", () => {
    const chip = mount(timedChip("abc"));
    painter.update([{ key: "abc", color: MINT, at: 1 }], [{ from: MINT, to: "#ffb7b2", at: 5 }], ["me@m"]);
    painter.apply(chip);
    expect(sameColor(bg(chip), "#ffb7b2")).toBe(true);
  });

  it("paints a month-view dot and leaves the text alone", () => {
    const chip = mount(monthDotChip("m1", RED, "rgb(160, 0, 0)"));
    painter.update([{ key: "m1", color: MINT, at: 1 }]);
    expect(painter.apply(chip)).toBe("painted");
    const dot = chip.querySelector<HTMLElement>(".VlNR9e")!;
    expect(sameColor(dot.style.getPropertyValue("border-color"), MINT)).toBe(true);
    expect(chip.querySelector<HTMLElement>(".WBi6vc")!.style.getPropertyValue("color")).toBe("");
    expect(painter.apply(chip)).toBe("kept");
  });

  it("keeps Google's past-event tint when painting a past month-view dot", () => {
    const chip = mount(monthDotChip("m2", "rgb(242, 179, 179)", "rgb(234, 128, 128)"));
    painter.update([{ key: "m2", color: MINT, at: 1 }]);
    expect(painter.apply(chip)).toBe("painted");
    const dot = chip.querySelector<HTMLElement>(".VlNR9e")!;
    expect(sameColor(dot.style.getPropertyValue("border-color"), tint(MINT, 0.3))).toBe(true);
    expect(sameColor(chip.style.getPropertyValue("border-color"), tint(MINT, 0.5))).toBe(true);
    expect(painter.apply(chip)).toBe("kept");
  });

  it("tints a past all-day chip and repaints it after a re-render", () => {
    mount(pastAllDayChip("p1"));
    painter.update([{ key: "p1", color: MINT, at: 1 }]);
    expect(painter.applyAll()).toBe(1);
    let button = document.querySelector<HTMLElement>("[data-stacked-layout-chip]")!;
    expect(sameColor(bg(button), tint(MINT, 0.3))).toBe(true);
    rerender(pastAllDayChip("p1"));
    button = document.querySelector<HTMLElement>("[data-stacked-layout-chip]")!;
    expect(painter.apply(document.querySelector<HTMLElement>("[data-eventchip]")!)).toBe("painted");
    expect(sameColor(bg(button), tint(MINT, 0.3))).toBe(true);
  });

  it("recognizes a past chip that Google already shows in the new color", () => {
    mount(pastAllDayChip("p2"));
    painter.update([{ key: "p2", color: "rgb(213, 0, 0)", at: 1 }]);
    expect(painter.apply(document.querySelector<HTMLElement>("[data-eventchip]")!)).toBe("native");
  });

  it("restores Google's colors exactly when it steps aside", () => {
    const chip = mount(pastAllDayChip("p3"));
    painter.update([{ key: "p3", color: MINT, at: 1 }]);
    painter.apply(chip);
    // Someone picks a color by hand: Google rewrites the button's inline style.
    const button = chip.querySelector<HTMLElement>("[data-stacked-layout-chip]")!;
    button.style.backgroundColor = "rgb(200, 220, 255)";
    expect(painter.apply(chip)).toBe("released");
    expect(sameColor(chip.style.getPropertyValue("border-color"), "rgb(234, 128, 128)")).toBe(true);
  });

  it("paints a batch as a short wave that finishes within the cap", async () => {
    const html = ["w1", "w2", "w3", "w4", "w5"].map((id) => timedChip(id)).join("");
    document.body.innerHTML = `<div id="grid">${html}</div>`;
    painter.update(["w1", "w2", "w3", "w4", "w5"].map((key) => ({ key, color: MINT, at: 1 })));
    painter.applyAllStaggered(document, 28, 100);
    const chips = Array.from(document.querySelectorAll("[data-eventchip]"));
    expect(chips.filter((c) => sameColor(bg(c), MINT)).length).toBe(1); // the first at once
    await new Promise((r) => setTimeout(r, 150));
    expect(chips.every((c) => sameColor(bg(c), MINT))).toBe(true);
  });
});
