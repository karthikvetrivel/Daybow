/** The options page: account, categories (a calendar-style editor), Jev key, tuning. */
import { MAX_USER_LABELS, type UserLabel } from "../../lib/taxonomy";
import { mountCategoryCalendar, type CategoryCalendar, type SaveResult } from "../../ui/category-calendar";

type Status = {
  email: string | null;
  user: null | { labelMode: string; labelModeReason?: string; lastRun?: { at: string; labeled: number; alreadyLabeled: number; lowConfidence: number; scanned: number; errors: string[] }; timeZone: string; processedCount: number };
  labels: UserLabel[];
  settings: { jevApiKey: string; minConfidence: number; windowPastDays: number; windowFutureDays: number; sweepMinutes: number };
  hasJevKey: boolean;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const send = <T = unknown>(msg: unknown) => new Promise<T>((resolve) => chrome.runtime.sendMessage(msg, (r: T) => resolve(r)));

function notice(text: string, bad = false) {
  const n = $("notice");
  n.textContent = text;
  n.hidden = !text;
  n.classList.toggle("bad", bad);
}

const COLORS_NOTE = "This account uses Google's 11 event colors, so each color snaps to the closest one on the calendar.";
let calendar: CategoryCalendar | null = null;

function showCount(labels: UserLabel[]) {
  $("catcount").textContent = `${labels.length} of ${MAX_USER_LABELS}`;
}

/** Draws the categories editor, or brings it up to date after sign-in, sign-out, or a run. */
function showCategories(s: Status) {
  const note = s.user?.labelMode === "colors" ? COLORS_NOTE : undefined;
  const readOnly = !s.email;
  showCount(s.labels);
  if (calendar) {
    calendar.update(s.labels, { note, readOnly });
    return;
  }
  calendar = mountCategoryCalendar($("catcal"), {
    labels: s.labels,
    note,
    readOnly,
    save: (labels) => send<SaveResult>({ type: "saveCategories", labels }),
    onChange: showCount,
  });
}

async function refresh() {
  const s = await send<Status>({ type: "status" });
  const signedIn = Boolean(s.email);
  $("account-line").textContent = signedIn ? "Your calendar is connected" : "Not signed in";
  $("acct").innerHTML = signedIn ? `<span class="muted small">${s.email}</span><span class="avatar">${(s.email ?? "?")[0].toUpperCase()}</span>` : "";
  const pill = $("statuspill");
  pill.textContent = signedIn ? "Labeling on" : "Signed out";
  pill.className = signedIn ? "pill ok" : "pill";
  showCategories(s);
  $("signin").hidden = signedIn;
  $("run").hidden = !signedIn;
  $("signout").hidden = !signedIn;
  const stats = $("stats");
  const run = s.user?.lastRun;
  stats.hidden = !run;
  if (run) {
    const mode = s.user?.labelMode === "labels" ? "named labels" : `event colors${s.user?.labelModeReason ? ` (${s.user.labelModeReason})` : ""}`;
    stats.innerHTML = `
      <div class="stat sky"><b>${run.labeled}</b><span>labeled last run</span></div>
      <div class="stat butter"><b>${run.alreadyLabeled}</b><span>already labeled</span></div>
      <div class="stat mint"><b>${run.lowConfidence}</b><span>left alone</span></div>
      <div class="stat blush"><b>${run.scanned}</b><span>events scanned</span></div>`;
    $("runline").textContent = `Last run ${new Date(run.at).toLocaleString()} · ${mode}${run.errors.length ? ` · ${run.errors.length} error(s): ${run.errors[0].slice(0, 120)}` : ""}`;
  } else {
    $("runline").textContent = "";
  }
  $("key-line").textContent = s.hasJevKey ? `Key ${s.settings.jevApiKey}` : "No key yet. Paste one to start labeling.";
  ($("minconf") as HTMLInputElement).value = String(s.settings.minConfidence);
  ($("sweep") as HTMLInputElement).value = String(s.settings.sweepMinutes);
  ($("past") as HTMLInputElement).value = String(s.settings.windowPastDays);
  ($("future") as HTMLInputElement).value = String(s.settings.windowFutureDays);
}

async function busy(btn: HTMLButtonElement, fn: () => Promise<void>) {
  btn.disabled = true;
  try {
    await fn();
  } finally {
    btn.disabled = false;
  }
}

$("signin").addEventListener("click", () =>
  busy($("signin") as HTMLButtonElement, async () => {
    notice("Opening Google sign-in…");
    const r = await send<{ ok: boolean; message: string }>({ type: "signIn" });
    notice(r?.message ?? "Signed in.", r && !r.ok);
    await refresh();
  }),
);
$("run").addEventListener("click", () =>
  busy($("run") as HTMLButtonElement, async () => {
    notice("Labeling…");
    const r = await send<{ ok: boolean; message: string }>({ type: "run" });
    notice(r.message, !r.ok);
    await refresh();
  }),
);
$("signout").addEventListener("click", async () => {
  await send({ type: "signOut" });
  notice("Signed out. Stored data removed.");
  await refresh();
});
$("savekey").addEventListener("click", async () => {
  const key = ($("jevkey") as HTMLInputElement).value.trim();
  if (!key) return;
  await send({ type: "saveSettings", patch: { jevApiKey: key } });
  ($("jevkey") as HTMLInputElement).value = "";
  await refresh();
});
$("savetuning").addEventListener("click", async () => {
  await send({
    type: "saveSettings",
    patch: {
      minConfidence: Number(($("minconf") as HTMLInputElement).value),
      sweepMinutes: Number(($("sweep") as HTMLInputElement).value),
      windowPastDays: Number(($("past") as HTMLInputElement).value),
      windowFutureDays: Number(($("future") as HTMLInputElement).value),
    },
  });
  notice("Tuning saved.");
  await refresh();
});

void refresh();
