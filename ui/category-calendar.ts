/**
 * The categories editor. It draws a Google Calendar-style week in which each
 * category shows up as events titled with its example titles, so the week
 * shows what each category catches.
 *
 * - Click an event or a category pill to open a card like Calendar's event
 *   card. Pick a pastel color, rename the category, describe what belongs in
 *   it, and add or remove example titles.
 * - Click an empty part of a day to add a category, the way you create an event.
 * - Colors save as soon as you pick them. Other edits save when the card closes.
 *
 * The module uses no framework, so the extension's configuration page and the
 * web app share it. User text goes into the page through textContent and
 * value only, never through HTML.
 */
import { PASTELS, PASTEL_COLUMNS, inkFor, nextPastel, pastelName } from "../lib/palette";
import { MAX_NAME_LEN, MAX_TEXT_LEN, MAX_USER_LABELS, defaultUserLabels, normalizeHex, validateLabels, type UserLabel } from "../lib/taxonomy";
import { formatRange, sampleWeek } from "../lib/week";

export interface SaveResult {
  ok: boolean;
  message?: string;
}

export interface CategoryCalendarOptions {
  labels: UserLabel[];
  /** Stores the categories. `undefined` restores the defaults. */
  save: (labels: UserLabel[] | undefined) => Promise<SaveResult>;
  /** A line under the palette, for example for accounts limited to Google's 11 colors. */
  note?: string;
  /** Shows the week without editing, for example before sign-in. */
  readOnly?: boolean;
  /** Called after every local change, for example to update a count. */
  onChange?: (labels: UserLabel[]) => void;
  /** The clock. Tests pass a fixed date. */
  now?: () => Date;
  /** How long a color pick waits for another pick before it saves. */
  colorSaveDelayMs?: number;
}

export interface CategoryCalendar {
  /** Shows categories that changed elsewhere. While a save is pending, the local categories stay. */
  update(labels: UserLabel[], opts?: { note?: string; readOnly?: boolean }): void;
  /** Sends a pending color pick now and resolves when every save finished. */
  settle(): Promise<void>;
  destroy(): void;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_EXAMPLES = 12;

const ICONS = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  palette:
    '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1-.8-1.3-.8-2.2 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.8 17 3 12 3z"/><circle cx="7.5" cy="11" r=".9"/><circle cx="10" cy="7.2" r=".9"/><circle cx="14.5" cy="7.2" r=".9"/>',
  notes: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7-8.3-8.3z"/><circle cx="8" cy="8" r="1.2"/>',
};

function icon(name: keyof typeof ICONS, size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(className: string, label: string, content: { icon?: keyof typeof ICONS; text?: string; size?: number }): HTMLButtonElement {
  const b = el("button", className);
  b.type = "button";
  if (content.icon) b.innerHTML = icon(content.icon, content.size);
  if (content.text !== undefined) b.append(el("span", "", content.text));
  if (label) {
    b.title = label;
    b.setAttribute("aria-label", label);
  }
  return b;
}

const cloneAll = (labels: UserLabel[]) => labels.map((l) => ({ ...l, examples: [...l.examples] }));
const sameLabel = (a: UserLabel, b: UserLabel) =>
  a.name === b.name && a.color === b.color && a.what === b.what && a.examples.join("\n") === b.examples.join("\n");

function paint(e: HTMLElement, color: string) {
  e.style.setProperty("--c", color);
  e.style.setProperty("--ink", inkFor(color));
}

interface Card {
  pop: HTMLElement;
  anchor: HTMLElement;
  /** Null while the user creates a category. */
  key: string | null;
  /** The day that the user clicked to create the category. */
  day: number;
  draft: UserLabel;
  syncColor(): void;
  takeTypedExample(): void;
  setError(message: string): void;
}

export function mountCategoryCalendar(root: HTMLElement, options: CategoryCalendarOptions): CategoryCalendar {
  let labels = cloneAll(options.labels);
  let note = options.note;
  let readOnly = Boolean(options.readOnly);
  const now = options.now ?? (() => new Date());
  const colorDelay = options.colorSaveDelayMs ?? 450;
  /** Categories created in this session keep their first event on the day the user clicked. */
  const home = new Map<string, number>();
  let card: Card | null = null;
  let fresh: string | null = null;
  let colorTimer: ReturnType<typeof setTimeout> | undefined;
  let colorMessage = "";
  let inflight = 0;
  let chain: Promise<void> = Promise.resolve();
  let snackTimer: ReturnType<typeof setTimeout> | undefined;
  let closedByClick = false;

  root.classList.add("dbw");
  const hint = el("p", "dbw-hint");
  const legend = el("div", "dbw-legend");
  const week = el("div", "dbw-week");
  const footer = el("div", "dbw-footer");
  root.replaceChildren(hint, legend, week, footer);
  const snack = el("div", "dbw-snack");
  snack.setAttribute("role", "status");
  snack.hidden = true;
  document.body.append(snack);

  const changed = () => options.onChange?.(cloneAll(labels));

  function toast(message: string, bad = false) {
    snack.textContent = message;
    snack.classList.toggle("bad", bad);
    snack.hidden = false;
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => (snack.hidden = true), bad ? 7000 : 3500);
  }

  // ---- Saving -------------------------------------------------------------

  function persist(message: string, reset = false) {
    const snapshot = reset ? undefined : cloneAll(labels);
    inflight++;
    chain = chain.then(async () => {
      let r: SaveResult;
      try {
        r = await options.save(snapshot);
      } catch (err) {
        r = { ok: false, message: `Not saved. ${err instanceof Error ? err.message : String(err)}` };
      }
      inflight--;
      toast(r.ok ? message : r.message || "Not saved. Try again.", !r.ok);
    });
  }

  function flushColor() {
    clearTimeout(colorTimer);
    colorTimer = undefined;
    if (!colorMessage) return;
    const message = colorMessage;
    colorMessage = "";
    persist(message);
  }

  /** Replaces the categories after an edit, redraws, and saves. A pending color pick rides along. */
  function commit(next: UserLabel[], message: string) {
    labels = next;
    clearTimeout(colorTimer);
    colorTimer = undefined;
    colorMessage = "";
    renderAll();
    changed();
    persist(message);
  }

  // ---- Drawing --------------------------------------------------------------

  function renderHint() {
    hint.textContent = readOnly
      ? "Sign in to edit your categories."
      : "Click an event to recolor its category or change what it catches. Click an empty spot in a day to add a category.";
  }

  function renderLegend() {
    legend.replaceChildren();
    for (const l of labels) {
      const pill = button("dbw-pill", readOnly ? "" : `Edit ${l.name}`, {});
      pill.dataset.key = l.key;
      paint(pill, l.color);
      pill.append(el("span", "dot"), el("span", "", l.name));
      legend.append(pill);
    }
    if (!readOnly && labels.length < MAX_USER_LABELS) {
      const add = button("dbw-pill dbw-new", "", { icon: "plus", size: 16, text: "New category" });
      add.dataset.act = "new";
      legend.append(add);
    }
  }

  function chip(l: UserLabel, title: string, time: string, index: number): HTMLButtonElement {
    const c = button(`dbw-chip${fresh === l.key ? " fresh" : ""}`, "", {});
    c.dataset.key = l.key;
    paint(c, l.color);
    c.style.setProperty("--delay", `${Math.min(index * 22, 440)}ms`);
    c.append(el("span", "t", title), el("small", "", time));
    c.setAttribute("aria-label", `${title}, ${time}. ${l.name}`);
    return c;
  }

  function draftChip(d: UserLabel): HTMLButtonElement {
    const c = button("dbw-chip draft", "", {});
    c.dataset.draft = "1";
    paint(c, d.color);
    c.append(el("span", "t", d.name.trim() || "(No title)"), el("small", "", "New category"));
    return c;
  }

  function renderWeek() {
    const days = sampleWeek(labels, now(), home);
    const byKey = new Map(labels.map((l) => [l.key, l]));
    const grid = el("div", "dbw-days");
    let index = 0;
    days.forEach((d, i) => {
      const col = el("div", `dbw-day${d.today ? " today" : ""}`);
      col.dataset.day = String(i);
      const head = el("div", "dbw-head");
      head.append(el("div", "dbw-dow", DAY_NAMES[i]), el("div", "dbw-date", String(d.date.getDate())));
      const list = el("div", "dbw-events");
      for (const ev of d.events) {
        const l = byKey.get(ev.key);
        if (l) list.append(chip(l, ev.title, formatRange(ev.start, ev.end), index++));
      }
      if (card && card.key === null && card.day === i) list.append(draftChip(card.draft));
      col.append(head, list);
      if (!readOnly && labels.length < MAX_USER_LABELS) {
        const add = button("dbw-add", "", { icon: "plus", size: 14, text: "Add category" });
        add.dataset.act = "new";
        col.append(add);
      }
      grid.append(col);
    });
    week.replaceChildren(grid);
  }

  function renderFooter() {
    footer.replaceChildren();
    if (readOnly) return;
    const reset = button("dbw-link", "", { text: "Reset to defaults" });
    reset.addEventListener("click", () => {
      const question = el("span", "dbw-q", "Reset every category to the defaults?");
      const no = button("dbw-text", "", { text: "Cancel" });
      const yes = button("dbw-danger", "", { text: "Reset" });
      no.addEventListener("click", renderFooter);
      yes.addEventListener("click", () => {
        closeCard(false);
        labels = defaultUserLabels();
        home.clear();
        clearTimeout(colorTimer);
        colorTimer = undefined;
        colorMessage = "";
        renderAll();
        changed();
        persist("Categories reset to the defaults.", true);
      });
      footer.replaceChildren(question, no, yes);
      yes.focus();
    });
    footer.append(reset);
  }

  function renderAll() {
    renderHint();
    renderLegend();
    renderWeek();
    renderFooter();
    spotlight(card?.key ?? null);
  }

  function spotlight(key: string | null) {
    root.classList.toggle("spot", key !== null);
    root.querySelectorAll<HTMLElement>("[data-key]").forEach((e) => e.classList.toggle("on", e.dataset.key === key));
  }

  function chipFor(key: string): HTMLElement | null {
    return Array.from(root.querySelectorAll<HTMLElement>(".dbw-chip[data-key], .dbw-pill[data-key]")).find((e) => e.dataset.key === key) ?? null;
  }

  // ---- The card -------------------------------------------------------------

  function place() {
    const c = card;
    if (!c) return;
    if (!c.anchor.isConnected) {
      const again = c.key === null ? week.querySelector<HTMLElement>(".dbw-chip.draft") : chipFor(c.key);
      if (again) c.anchor = again;
    }
    const pop = c.pop;
    const narrow = window.innerWidth < 600;
    pop.classList.toggle("sheet", narrow);
    if (narrow) {
      pop.style.left = "";
      pop.style.top = "";
      return;
    }
    const r = c.anchor.getBoundingClientRect();
    const w = pop.offsetWidth || 368;
    const h = pop.offsetHeight || 460;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    let left = r.right + 10;
    if (left + w > vw - 8) left = r.left - 10 - w;
    if (left < 8) left = Math.max(8, Math.min(r.left, vw - w - 8));
    const top = Math.max(8, Math.min(r.top - 8, vh - h - 8));
    pop.style.left = `${Math.round(left + window.scrollX)}px`;
    pop.style.top = `${Math.round(top + window.scrollY)}px`;
  }

  function openCard(key: string, anchor: HTMLElement) {
    if (readOnly) {
      toast("Sign in to edit your categories.");
      return;
    }
    if (card && card.key === key) {
      card.anchor = anchor;
      place();
      return;
    }
    if (!closeCard(true)) return;
    const l = labels.find((x) => x.key === key);
    if (!l) return;
    card = buildCard(key, 0, anchor, { ...l, examples: [...l.examples] });
    spotlight(key);
  }

  function openNew(day: number) {
    if (readOnly) return;
    if (labels.length >= MAX_USER_LABELS) {
      toast(`At most ${MAX_USER_LABELS} categories.`);
      return;
    }
    if (!closeCard(true)) return;
    const draft: UserLabel = { key: "", name: "", color: nextPastel(labels.map((l) => l.color)), what: "", examples: [] };
    const c = buildCard(null, day, root, draft);
    renderWeek();
    c.anchor = week.querySelector<HTMLElement>(".dbw-chip.draft") ?? root;
    spotlight(null);
    place();
    c.pop.querySelector<HTMLInputElement>(".dbw-name")?.focus();
  }

  /** Saves what the card changed. Returns false and shows why when the change is not valid. */
  function commitCard(c: Card): boolean {
    c.takeTypedExample();
    const d = c.draft;
    const name = d.name.trim();
    if (c.key === null) {
      if (!name) return true; // nothing typed: drop the draft
      const v = validateLabels([...labels, { ...d, name, what: d.what.trim(), key: "" }]);
      if (!v.labels) {
        c.setError(v.error ?? "Check the fields.");
        return false;
      }
      const created = v.labels[v.labels.length - 1];
      home.set(created.key, c.day);
      fresh = created.key;
      commit(v.labels, `Added ${created.name}.`);
      return true;
    }
    const i = labels.findIndex((l) => l.key === c.key);
    if (i < 0) return true;
    const edited: UserLabel = { ...labels[i], name, what: d.what.trim(), examples: [...d.examples] };
    if (sameLabel(edited, labels[i])) return true;
    if (!name) {
      c.setError("Every category needs a name.");
      return false;
    }
    const next = labels.slice();
    next[i] = edited;
    const v = validateLabels(next);
    if (!v.labels) {
      c.setError(v.error ?? "Check the fields.");
      return false;
    }
    commit(v.labels, `Saved ${edited.name}.`);
    return true;
  }

  function closeCard(save: boolean): boolean {
    const c = card;
    if (!c) return true;
    if (save && !commitCard(c)) return false;
    c.pop.remove();
    card = null;
    if (c.key === null) renderWeek();
    fresh = null;
    spotlight(null);
    return true;
  }

  /** Closes the card and gives keyboard focus back to the category's first event. */
  function finish(save = true) {
    const key = card?.key ?? null;
    const creating = key === null;
    if (!closeCard(save)) return;
    const target = creating ? week.querySelector<HTMLElement>(".dbw-chip.fresh") : key ? chipFor(key) : null;
    target?.focus();
  }

  function pickColor(hex: string) {
    const c = card;
    const color = normalizeHex(hex);
    if (!c || !color) return;
    c.draft.color = color;
    c.syncColor();
    if (c.key === null) {
      const d = week.querySelector<HTMLElement>(".dbw-chip.draft");
      if (d) paint(d, color);
      return;
    }
    const i = labels.findIndex((l) => l.key === c.key);
    if (i < 0 || labels[i].color === color) return;
    labels[i] = { ...labels[i], color };
    root.querySelectorAll<HTMLElement>("[data-key]").forEach((e) => {
      if (e.dataset.key === c.key) paint(e, color);
    });
    changed();
    colorMessage = `${labels[i].name} is now ${pastelName(color) ?? color}.`;
    clearTimeout(colorTimer);
    colorTimer = setTimeout(flushColor, colorDelay);
  }

  function confirmRemove(c: Card) {
    const l = labels.find((x) => x.key === c.key);
    if (!l) return;
    if (labels.length <= 1) {
      c.setError("Keep at least one category.");
      return;
    }
    const box = el("div", "dbw-confirm");
    box.append(
      el("p", "dbw-confirm-title", `Remove ${l.name}?`),
      el("p", "dbw-confirm-text", "Jev stops picking it for new events. Events that already have this label keep it."),
    );
    const actions = el("div", "dbw-actions");
    const cancel = button("dbw-text", "", { text: "Cancel" });
    const remove = button("dbw-danger", "", { text: "Remove" });
    actions.append(cancel, remove);
    box.append(actions);
    c.pop.classList.add("confirming");
    c.pop.append(box);
    remove.focus();
    cancel.addEventListener("click", () => {
      box.remove();
      c.pop.classList.remove("confirming");
    });
    remove.addEventListener("click", () => {
      c.pop.remove();
      card = null;
      home.delete(l.key);
      commit(
        labels.filter((x) => x.key !== l.key),
        `Removed ${l.name}.`,
      );
    });
  }

  function buildCard(key: string | null, day: number, anchor: HTMLElement, draft: UserLabel): Card {
    const creating = key === null;
    const d = draft;
    const pop = el("div", "dbw-pop");
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", creating ? "New category" : `Edit ${d.name}`);
    paint(pop, d.color);

    const row = (lead: HTMLElement) => {
      const r = el("div", "dbw-row");
      const body = el("div", "dbw-rowbody");
      r.append(lead, body);
      pop.append(r);
      return body;
    };
    const lead = (name: keyof typeof ICONS) => {
      const s = el("span", "dbw-ic");
      s.innerHTML = icon(name);
      return s;
    };

    const bar = el("div", "dbw-bar");
    const remove = button("dbw-icon", "Remove category", { icon: "trash" });
    const close = button("dbw-icon", creating ? "Discard" : "Close", { icon: "close" });
    if (!creating) bar.append(remove);
    bar.append(close);
    pop.append(bar);

    const name = el("input", "dbw-name");
    name.value = d.name;
    name.maxLength = MAX_NAME_LEN;
    name.placeholder = "Add title";
    name.autocomplete = "off";
    name.spellcheck = false;
    name.setAttribute("aria-label", "Category name");
    row(el("span", "dbw-sq")).append(name);

    const colors = row(lead("palette"));
    const grid = el("div", "dbw-swatches");
    grid.setAttribute("role", "radiogroup");
    grid.setAttribute("aria-label", "Color");
    grid.style.setProperty("--cols", String(PASTEL_COLUMNS));
    for (const p of PASTELS) {
      const sw = button("dbw-sw", p.name, { icon: "check", size: 16 });
      sw.dataset.hex = p.hex;
      sw.setAttribute("role", "radio");
      paint(sw, p.hex);
      grid.append(sw);
    }
    const custom = el("div", "dbw-custom");
    const plus = button("dbw-plus", "Custom color", { icon: "plus", size: 16 });
    const hexLabel = el("span", "dbw-hex");
    const picker = el("input", "dbw-picker");
    picker.type = "color";
    picker.tabIndex = -1;
    picker.setAttribute("aria-hidden", "true");
    custom.append(plus, hexLabel, picker);
    colors.append(grid, custom);
    if (note) colors.append(el("p", "dbw-note", note));

    const what = el("textarea", "dbw-what");
    what.value = d.what;
    what.maxLength = MAX_TEXT_LEN;
    what.rows = 3;
    what.placeholder = "What belongs here";
    what.setAttribute("aria-label", "What belongs here");
    row(lead("notes")).append(what);

    const examples = row(lead("tag"));
    const tags = el("div", "dbw-tags");
    const typed = el("input", "dbw-exin");
    typed.placeholder = "Add an example title";
    typed.maxLength = 80;
    typed.autocomplete = "off";
    typed.setAttribute("aria-label", "Add an example title");
    examples.append(el("div", "dbw-label", "Catches titles like"), tags);

    const foot = el("div", "dbw-cardfoot");
    const error = el("span", "dbw-err");
    error.setAttribute("role", "alert");
    const done = button("dbw-done", "", { text: creating ? "Save" : "Done" });
    foot.append(error, done);
    pop.append(foot);

    const setError = (message: string) => {
      error.textContent = message;
      pop.classList.remove("shake");
      void pop.offsetWidth;
      pop.classList.add("shake");
    };

    const syncColor = () => {
      paint(pop, d.color);
      const items = Array.from(grid.querySelectorAll<HTMLButtonElement>(".dbw-sw"));
      const selected = items.find((s) => s.dataset.hex === d.color);
      items.forEach((s) => {
        s.setAttribute("aria-checked", String(s === selected));
        s.tabIndex = s === (selected ?? items[0]) ? 0 : -1;
      });
      // A color outside the palette shows on the custom button, checked like a swatch.
      plus.classList.toggle("on", !selected);
      plus.innerHTML = icon(selected ? "plus" : "check", 16);
      if (selected) plus.style.removeProperty("--c");
      else paint(plus, d.color);
      hexLabel.textContent = selected ? "Custom color" : `Custom ${d.color}`;
      picker.value = d.color;
    };

    const renderTags = () => {
      tags.replaceChildren();
      d.examples.forEach((t, i) => {
        const tag = el("span", "dbw-tag");
        const x = button("dbw-x", `Remove ${t}`, { icon: "close", size: 14 });
        x.addEventListener("click", () => {
          d.examples.splice(i, 1);
          renderTags();
          typed.focus();
        });
        tag.append(el("span", "", t), x);
        tags.append(tag);
      });
      tags.append(typed);
    };

    const addExamples = (raw: string) => {
      for (const t of raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)) {
        if (d.examples.some((e) => e.toLowerCase() === t.toLowerCase())) continue;
        if (d.examples.length >= MAX_EXAMPLES) {
          setError(`At most ${MAX_EXAMPLES} example titles.`);
          break;
        }
        if ([...d.examples, t].join(", ").length > MAX_TEXT_LEN) {
          setError("The example titles are too long in total.");
          break;
        }
        d.examples.push(t);
      }
      renderTags();
    };
    const takeTypedExample = () => {
      if (!typed.value.trim()) return;
      addExamples(typed.value);
      typed.value = "";
    };

    name.addEventListener("input", () => {
      d.name = name.value;
      error.textContent = "";
      if (creating) {
        const t = week.querySelector(".dbw-chip.draft .t");
        if (t) t.textContent = name.value.trim() || "(No title)";
      }
    });
    name.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish();
      }
    });
    const fitWhat = () => {
      if (!what.scrollHeight) return;
      what.style.height = "auto";
      what.style.height = `${Math.min(what.scrollHeight + 2, 240)}px`;
    };
    what.addEventListener("input", () => {
      d.what = what.value;
      fitWhat();
    });
    typed.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        if (typed.value.trim()) takeTypedExample();
        else if (e.key === "Enter") finish();
        typed.focus();
      } else if (e.key === "Backspace" && !typed.value && d.examples.length) {
        d.examples.pop();
        renderTags();
        typed.focus();
      }
    });
    typed.addEventListener("paste", (e) => {
      const text = e.clipboardData?.getData("text") ?? "";
      if (!/[,\n]/.test(text)) return;
      e.preventDefault();
      addExamples(text);
      typed.focus();
    });
    grid.addEventListener("click", (e) => {
      const sw = (e.target as HTMLElement).closest<HTMLButtonElement>(".dbw-sw");
      if (sw?.dataset.hex) pickColor(sw.dataset.hex);
    });
    grid.addEventListener("keydown", (e) => {
      const items = Array.from(grid.querySelectorAll<HTMLButtonElement>(".dbw-sw"));
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      if (i < 0) return;
      const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: PASTEL_COLUMNS, ArrowUp: -PASTEL_COLUMNS };
      let j: number;
      if (e.key in step) j = Math.min(items.length - 1, Math.max(0, i + step[e.key]));
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = items.length - 1;
      else return;
      e.preventDefault();
      items.forEach((s, k) => (s.tabIndex = k === j ? 0 : -1));
      items[j].focus();
    });
    plus.addEventListener("click", () => {
      const p = picker as HTMLInputElement & { showPicker?: () => void };
      try {
        if (p.showPicker) p.showPicker();
        else p.click();
      } catch {
        p.click();
      }
    });
    picker.addEventListener("input", () => pickColor(picker.value));
    remove.addEventListener("click", () => {
      if (card) confirmRemove(card);
    });
    close.addEventListener("click", () => finish(!creating));
    done.addEventListener("click", () => finish());

    renderTags();
    syncColor();
    document.body.append(pop);
    fitWhat();
    const c: Card = { pop, anchor, key, day, draft: d, syncColor, takeTypedExample, setError };
    card = c;
    place();
    if (!creating) (grid.querySelector<HTMLElement>('.dbw-sw[tabindex="0"]') ?? name).focus();
    return c;
  }

  // ---- Events ---------------------------------------------------------------

  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-act="new"]')) {
      if (closedByClick) return;
      const day = t.closest<HTMLElement>(".dbw-day");
      openNew(day ? Number(day.dataset.day) : (now().getDay() + 6) % 7);
      return;
    }
    const target = t.closest<HTMLElement>(".dbw-chip, .dbw-pill");
    if (target?.dataset.key) {
      openCard(target.dataset.key, target.isConnected ? target : (chipFor(target.dataset.key) ?? target));
      return;
    }
    if (target?.dataset.draft) return;
    const day = t.closest<HTMLElement>(".dbw-day");
    if (day && !t.closest(".dbw-head") && !closedByClick && !readOnly) openNew(Number(day.dataset.day));
  });
  root.addEventListener("mouseover", (e) => {
    const key = (e.target as HTMLElement).closest<HTMLElement>("[data-key]")?.dataset.key;
    spotlight(key ?? card?.key ?? null);
  });
  root.addEventListener("mouseleave", () => spotlight(card?.key ?? null));

  // A click outside the card closes it. That click does not also create a category.
  const onDocumentClick = (e: MouseEvent) => {
    if (!card) return;
    const t = e.target as Node;
    if (card.pop.contains(t) || (card.anchor.isConnected && card.anchor.contains(t))) return;
    closedByClick = true;
    closeCard(true);
    setTimeout(() => (closedByClick = false), 0);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !card) return;
    e.preventDefault();
    finish(card.key !== null);
  };
  const onResize = () => place();
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);

  renderAll();

  return {
    update(next, opts) {
      if (opts && "note" in opts) note = opts.note;
      if (opts && "readOnly" in opts) readOnly = Boolean(opts.readOnly);
      if (colorTimer === undefined && inflight === 0) labels = cloneAll(next);
      if (card && (readOnly || (card.key !== null && !labels.some((l) => l.key === card!.key)))) closeCard(false);
      renderAll();
      place();
    },
    settle() {
      flushColor();
      return chain;
    },
    destroy() {
      clearTimeout(colorTimer);
      clearTimeout(snackTimer);
      card?.pop.remove();
      card = null;
      snack.remove();
      document.removeEventListener("click", onDocumentClick, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      root.replaceChildren();
      root.classList.remove("dbw", "spot");
    },
  };
}
