/**
 * Runs on calendar.google.com. Makes a new event's color appear the moment
 * its chip does, and keeps colors on this page in step with the server
 * without reloading.
 *
 * - While you type a title in Google's event dialog or editor, it asks the
 *   service worker for the category (cached, or one Jev call of ~180 ms).
 * - When the saved event's chip appears (Google draws it at once, about two
 *   seconds before it has stored the event), it paints the chip with that
 *   category in the same frame and asks the worker to write the label, which
 *   lands right after Google shows "Event saved".
 * - While the tab is visible, it asks every 20 seconds for colors that
 *   changed elsewhere, and it repaints chips that Google re-renders.
 */
import { chipMatchesDraft, isTitleField, norm } from "./draft";
import { CHIP_SELECTOR, Painter, chipCalendar, chipEventId, findChips, type Paint, type Remap } from "./paint";

interface Prediction {
  ok: boolean;
  key?: string;
  name?: string;
  color?: string;
  confidence: number;
}

type Payload = { paints?: Paint[]; remaps?: Remap[]; calendars?: string[]; found?: boolean } | null;

(() => {
  const TOAST_RE = /\bEvent (created|saved|updated|restored)\b/i;
  const POLL_MS = 20_000;
  const DRAFT_TTL_MS = 120_000;
  const pageLoadedAt = Date.now();
  const since = pageLoadedAt - 60_000;
  const painter = new Painter();
  const renderedAt = new Map<string, number>();
  const seen = new Set<string>();
  let calendars: string[] = [];
  let lastSave = 0;
  let alive = true;

  function send<T>(msg: unknown): Promise<T | null> {
    return new Promise((resolve) => {
      if (!alive) return resolve(null);
      try {
        chrome.runtime.sendMessage(msg, (res: T) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(res ?? null);
        });
      } catch {
        // The extension was reloaded or removed; this copy of the script is orphaned.
        alive = false;
        resolve(null);
      }
    });
  }

  function receive(res: Payload) {
    if (!res) return;
    if (res.calendars?.length) calendars = res.calendars.map((c) => c.toLowerCase());
    if (painter.update(res.paints ?? [], res.remaps ?? [], res.calendars)) painter.applyAllStaggered();
  }

  async function poll() {
    receive(await send<Payload>({ type: "paints", since }));
  }

  /* ---------- The title being typed, and its predicted category ---------- */

  interface Draft {
    title: string;
    typedAt: number;
    prediction?: Prediction;
    pending?: Promise<Prediction | null>;
  }
  let draft: Draft | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastHint: { title: string; key: string; at: number } | null = null;

  function predictionFor(d: Draft): Promise<Prediction | null> {
    if (d.prediction) return Promise.resolve(d.prediction);
    d.pending ??= send<Prediction>({ type: "predict", title: d.title }).then((p) => {
      if (p) d.prediction = p;
      return p;
    });
    return d.pending;
  }

  document.addEventListener(
    "input",
    (e) => {
      if (!isTitleField(e.target)) return;
      const title = (e.target as HTMLInputElement).value;
      if (draft && norm(draft.title) === norm(title)) {
        draft.typedAt = Date.now();
        return;
      }
      clearTimeout(timer);
      if (!norm(title)) {
        draft = null;
        return;
      }
      const d: Draft = { title, typedAt: Date.now() };
      draft = d;
      timer = setTimeout(() => void predictionFor(d), 120);
    },
    true,
  );

  document.addEventListener(
    "focusin",
    (e) => {
      if (isTitleField(e.target)) void send({ type: "warm" });
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") draft = null; // the dialog was cancelled
    },
    true,
  );

  /* ---------- New chips ---------- */

  function onNewChip(chip: HTMLElement, id: string) {
    const d = draft;
    if (!d || Date.now() - d.typedAt > DRAFT_TTL_MS) return;
    if (!chipMatchesDraft(chip.textContent ?? "", d.title)) return;
    const cal = chipCalendar(chip)?.toLowerCase();
    if (cal && calendars.length && !calendars.includes(cal)) return; // saved to another calendar
    draft = null; // one chip per draft
    clearTimeout(timer);
    void predictionFor(d).then((p) => {
      if (!p?.ok || !p.color || !p.key) return; // nothing fits: the regular path decides later
      painter.update([{ key: id, color: p.color, name: p.name, at: Date.now() }]);
      if (chip.isConnected) painter.apply(chip);
      else painter.applyAll(); // Google re-rendered the chip meanwhile
      lastHint = { title: d.title, key: p.key, at: Date.now() };
      void send<Payload>({ type: "labelNow", id, hint: { title: d.title, key: p.key }, since }).then((res) => {
        if (res?.found === false) painter.forget(id); // it never became an event (a task, for example)
        receive(res);
      });
    });
  }

  function noteChips(root: ParentNode) {
    const now = Date.now();
    for (const chip of findChips(root)) {
      const id = chipEventId(chip);
      if (!id) continue;
      renderedAt.set(id, now);
      if (seen.has(id)) continue;
      seen.add(id);
      if (now - pageLoadedAt > 1_500) onNewChip(chip, id);
    }
  }

  /* ---------- "Event saved" ---------- */

  function onSaved() {
    const now = Date.now();
    if (now - lastSave < 1_500) return;
    lastSave = now;
    requestAnimationFrame(async () => {
      const recent = [...renderedAt]
        .filter(([, t]) => Date.now() - t < 15_000 && t - pageLoadedAt > 1_500)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id]) => id);
      const hint = lastHint && Date.now() - lastHint.at < 60_000 ? { title: lastHint.title, key: lastHint.key } : undefined;
      receive(await send<Payload>({ type: "eventSaved", ids: recent, hint, since }));
      // Catch labels that land a little later (the sweep, or the web app).
      for (const delay of [2_500, 6_000, 12_000, 25_000]) setTimeout(poll, delay);
    });
  }

  function checkToast(text: string) {
    if (text.length < 200 && TOAST_RE.test(text)) onSaved();
  }

  /* ---------- Repainting ---------- */

  // Repaints of existing chips are batched to one pass per frame.
  const pending = new Set<HTMLElement>();
  let scheduled = false;
  function schedule(chip: HTMLElement) {
    pending.add(chip);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const chips = [...pending];
      pending.clear();
      for (const c of chips) if (c.isConnected) painter.apply(c);
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        for (const node of Array.from(m.addedNodes)) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            noteChips(el);
            if (painter.size) for (const chip of findChips(el)) schedule(chip);
            checkToast(el.textContent ?? "");
          } else if (node.nodeType === Node.TEXT_NODE) {
            checkToast(node.textContent ?? "");
          }
        }
      } else if (m.type === "attributes") {
        const target = m.target as Element;
        if (m.attributeName === "data-eventid") noteChips(target);
        if (painter.size) {
          const chip = target.closest?.(CHIP_SELECTOR) as HTMLElement | null;
          if (chip) schedule(chip);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "data-eventid"] });

  noteChips(document);
  setInterval(() => {
    if (document.visibilityState === "visible") void poll();
  }, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void poll();
  });
  void poll();
})();
