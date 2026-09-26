// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { sameColor } from "../extension/src/paint";

const b64 = (s: string) => btoa(s).replace(/=+$/, "");
const chip = (id: string, title: string, extra = "") =>
  `<div role="button" data-eventchip="" data-eventid="${b64(`${id} me@m`)}" jslog="35463; 2:[&quot;${id}&quot;,null]" style="background-color: rgb(213, 0, 0); border-color: rgb(213, 0, 0);"><div class="XuJrye">3pm to 4pm, ${title}, Me, No location, ${extra}October 6, 2026</div><div class="lhydbb"><span class="I0UMhf">${title}</span></div></div>`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sent: any[] = [];
const notFound = new Set<string>();

beforeAll(async () => {
  document.body.innerHTML = `<div id="grid">${chip("existing1", "Dinner with Sam")}</div><div id="dialogs"></div><div id="toasts"></div>`;
  (globalThis as any).chrome = {
    runtime: {
      lastError: undefined,
      sendMessage(msg: any, cb: (r: unknown) => void) {
        sent.push(msg);
        let res: unknown = { ok: true, paints: [], remaps: [], calendars: ["me@example.com", "me@m"] };
        if (msg.type === "predict") res = /dinner/i.test(msg.title) ? { ok: true, key: "social", name: "Social", color: "#ffe08a", confidence: 0.93 } : { ok: false, confidence: 0.2 };
        if (msg.type === "labelNow") res = notFound.has(msg.id) ? { ok: true, paints: [], found: false } : { ok: true, paints: [{ key: msg.id, color: "#ffe08a", at: Date.now() }], found: true, calendars: ["me@example.com", "me@m"] };
        setTimeout(() => cb(res), 5);
      },
    },
  };
  await import("../extension/src/content");
  await sleep(1_600); // chips that appear in the first 1.5 s count as part of the page load
});

function typeTitle(title: string) {
  document.getElementById("dialogs")!.innerHTML = `<div role="dialog"><input type="text" aria-label="Add title" placeholder="Add title"></div>`;
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  input.dispatchEvent(new Event("focusin", { bubbles: true }));
  input.value = title;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function save(id: string, title: string, extra = "") {
  document.getElementById("dialogs")!.innerHTML = "";
  document.getElementById("grid")!.insertAdjacentHTML("beforeend", chip(id, title, extra));
}

const bgOf = (id: string) => {
  const el = [...document.querySelectorAll<HTMLElement>("[data-eventchip]")].find((c) => c.getAttribute("jslog")!.includes(id))!;
  return el.style.getPropertyValue("background-color");
};

describe("content script: color at the moment of save", () => {
  it("predicts while typing and paints the new chip as soon as it appears", async () => {
    typeTitle("Dinner with Sam");
    expect(sent.some((m) => m.type === "warm")).toBe(true);
    await sleep(200); // debounce + prediction
    expect(sent.filter((m) => m.type === "predict").map((m) => m.title)).toEqual(["Dinner with Sam"]);
    save("new1", "Dinner with Sam");
    await sleep(0); // one turn: the observer and the ready prediction
    await sleep(0);
    expect(sameColor(bgOf("new1"), "#ffe08a")).toBe(true);
    const label = sent.find((m) => m.type === "labelNow");
    expect(label).toMatchObject({ id: "new1", hint: { title: "Dinner with Sam", key: "social" } });
  });

  it("leaves the existing chip with the same title alone", () => {
    expect(sameColor(bgOf("existing1"), "rgb(213, 0, 0)")).toBe(true);
  });

  it("paints right after the prediction when Save comes before it", async () => {
    typeTitle("Dinner at Lilia");
    save("new2", "Dinner at Lilia"); // saved within the debounce window
    await sleep(60);
    expect(sameColor(bgOf("new2"), "#ffe08a")).toBe(true);
  });

  it("does not touch a chip that got its own color in Google's dialog", async () => {
    typeTitle("Dinner party");
    await sleep(200);
    save("new3", "Dinner party", "Color: Tomato, ");
    await sleep(30);
    expect(sameColor(bgOf("new3"), "rgb(213, 0, 0)")).toBe(true);
    expect(sent.some((m) => m.type === "labelNow" && m.id === "new3")).toBe(false);
  });

  it("does nothing when no category fits", async () => {
    typeTitle("zzqx");
    await sleep(200);
    save("new4", "zzqx");
    await sleep(30);
    expect(sameColor(bgOf("new4"), "rgb(213, 0, 0)")).toBe(true);
  });

  it("undoes the paint when the chip never becomes an event", async () => {
    notFound.add("task1");
    typeTitle("Dinner shopping list");
    await sleep(200);
    save("task1", "Dinner shopping list");
    await sleep(60);
    expect(sameColor(bgOf("task1"), "rgb(213, 0, 0)")).toBe(true);
  });

  it("forgets a cancelled draft", async () => {
    typeTitle("Dinner with Alex");
    await sleep(200);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    save("other5", "Dinner with Alex"); // for example the same title showing up in another week
    await sleep(30);
    expect(sameColor(bgOf("other5"), "rgb(213, 0, 0)")).toBe(true);
  });

  it("sends the prediction along with the Event saved toast", async () => {
    document.getElementById("toasts")!.textContent = "Event saved";
    await sleep(50);
    const saved = sent.filter((m) => m.type === "eventSaved").pop();
    expect(saved).toBeTruthy();
    expect(saved.hint).toBeTruthy();
    expect(saved.ids.length).toBeGreaterThan(0);
  });
});
