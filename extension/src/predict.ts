/**
 * Title predictions: the category Jev picks from a title alone, used while
 * the user is still typing in Google's event dialog. Results are cached per
 * category set, so repeated titles ("Weekly sync") answer instantly.
 */
import { fnv1a } from "../../lib/features";
import type { JevClient } from "../../lib/jev";
import { criteriaFor, type UserLabel } from "../../lib/taxonomy";

export interface Prediction {
  ok: boolean;
  key?: string;
  name?: string;
  color?: string;
  confidence: number;
  cached?: boolean;
}

const KEY = "titleCache";
const MAX_ENTRIES = 400;

interface CacheShape {
  version: string;
  entries: Record<string, Prediction & { at: number }>;
}

export function normalizeTitle(title: string): string {
  return title.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Changes whenever the categories (or how colors show) change, which invalidates the cache. */
export function categoriesVersion(labels: UserLabel[], mode: string): string {
  return fnv1a(JSON.stringify([mode, labels.map((l) => [l.key, l.name, l.color, l.what, l.examples])]));
}

async function readCache(version: string): Promise<CacheShape> {
  const r = await chrome.storage.local.get(KEY);
  const c = r[KEY] as CacheShape | undefined;
  return c && c.version === version ? c : { version, entries: {} };
}

export async function cachedPrediction(version: string, title: string): Promise<Prediction | null> {
  const c = await readCache(version);
  const hit = c.entries[normalizeTitle(title)];
  return hit ? { ...hit, cached: true } : null;
}

export async function rememberPrediction(version: string, title: string, p: Prediction): Promise<void> {
  const c = await readCache(version);
  c.entries[normalizeTitle(title)] = { ...p, cached: undefined, at: Date.now() };
  const keys = Object.keys(c.entries);
  if (keys.length > MAX_ENTRIES) {
    keys.sort((a, b) => c.entries[a].at - c.entries[b].at);
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete c.entries[k];
  }
  await chrome.storage.local.set({ [KEY]: c });
}

/** Asks Jev for a title's category. `display` maps a category to the color it shows as. */
export async function predictTitle(
  title: string,
  labels: UserLabel[],
  jev: JevClient,
  minConfidence: number,
  display: (l: UserLabel) => string,
): Promise<Prediction> {
  const answer = await jev.classify({ title: title.trim() }, criteriaFor(labels));
  const label = labels.find((l) => l.key === answer.label);
  if (!label || answer.confidence < minConfidence) return { ok: false, key: answer.label, confidence: answer.confidence };
  return { ok: true, key: label.key, name: label.name, color: display(label), confidence: answer.confidence };
}

/** A Jev stand-in that always answers with a category already chosen. */
export function fixedJev(key: string): JevClient {
  return {
    classify: async () => ({ label: key, confidence: 1, probabilities: { [key]: 1 }, model: "prediction", inputTokens: 0 }),
  };
}
