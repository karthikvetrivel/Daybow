/**
 * Runs the classifier over a real Google Calendar export and prints what the
 * product would do. Reads .data/real-events.json (never committed).
 *
 *   npm run eval
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildState, isLabelable, type GEvent } from "../lib/features";
import { createJevClient } from "../lib/jev";
import { LABEL_BY_KEY } from "../lib/taxonomy";

function loadDotEnv(file: string) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no env file
  }
}
loadDotEnv(path.join(process.cwd(), ".env.local"));

const TYPE_MAP: Record<string, string> = { DEFAULT: "default", FROM_GMAIL: "fromGmail", OUT_OF_OFFICE: "outOfOffice", FOCUS_TIME: "focusTime", WORKING_LOCATION: "workingLocation", BIRTHDAY: "birthday" };

/** The connector export uses upper-case enum names; the REST API uses camelCase. */
function normalize(raw: Record<string, unknown>): GEvent {
  const e = raw as unknown as GEvent & { eventType?: string };
  return { ...e, eventType: TYPE_MAP[e.eventType ?? ""] ?? e.eventType };
}

async function main() {
  const file = process.argv[2] ?? path.join(process.cwd(), ".data", "real-events.json");
  const data = JSON.parse(readFileSync(file, "utf8")) as { events: Record<string, unknown>[]; timeZone?: string };
  const userEmail = process.env.EVAL_USER_EMAIL ?? "me@example.com";
  const tz = data.timeZone ?? "America/New_York";
  const minConfidence = Number(process.env.LABEL_MIN_CONFIDENCE ?? 0.5);
  const jev = createJevClient({ apiKey: process.env.TYPESAFE_API_KEY ?? "" });

  const events = data.events.map(normalize).filter(isLabelable);
  const seen = new Set<string>();
  const unique = events.filter((e) => {
    const t = e.recurringEventId ?? e.id;
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
  console.log(`events: ${data.events.length}, labelable: ${events.length}, unique targets: ${unique.length}`);

  const started = Date.now();
  let tokens = 0;
  const rows: string[] = [];
  const dist: Record<string, number> = {};
  let low = 0;
  const queue = [...unique];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const e = queue.shift()!;
      const state = buildState(e, { userEmail, timeZone: tz });
      const a = await jev.classify(state);
      tokens += a.inputTokens;
      const decided = a.label in LABEL_BY_KEY && a.confidence >= minConfidence;
      if (!decided) low++;
      const name = decided ? LABEL_BY_KEY[a.label].name : `(none: ${a.label})`;
      dist[name] = (dist[name] ?? 0) + 1;
      const runner = Object.entries(a.probabilities).sort((x, y) => y[1] - x[1])[1];
      rows.push(`| ${(e.summary ?? "").replace(/\|/g, "/").slice(0, 48)} | ${state.other_attendee_count} | ${state.source} | ${name} | ${a.confidence.toFixed(2)} | ${runner ? `${runner[0]} ${runner[1].toFixed(2)}` : ""} |`);
    }
  });
  await Promise.all(workers);
  const ms = Date.now() - started;

  const out = [
    `# Jev evaluation on a real calendar`,
    ``,
    `Unique events: ${unique.length}. Time: ${(ms / 1000).toFixed(1)}s. Input tokens: ${tokens} (about $${((tokens / 1e6) * 0.042).toFixed(4)}). Left unlabeled (below ${minConfidence}): ${low}.`,
    ``,
    `| Title | Others | Source | Label | Conf | Runner-up |`,
    `|---|---|---|---|---|---|`,
    ...rows.sort(),
    ``,
    `## Distribution`,
    ``,
    ...Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
  ].join("\n");
  const outFile = path.join(path.dirname(file), "eval.md");
  writeFileSync(outFile, out);
  console.log(out);
  console.log(`\nwritten to ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
