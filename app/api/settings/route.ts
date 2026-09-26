import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto";
import { readEnv } from "@/lib/env";
import { CalendarClient, RefreshTokenSource } from "@/lib/google";
import { applyLabelChanges, rememberLabelBaseline } from "@/lib/labeler";
import { SESSION_COOKIE, userIdFromSession } from "@/lib/session";
import { getStore, patchUser } from "@/lib/store";
import { effectiveLabels, validateLabels, type UserLabel } from "@/lib/taxonomy";

export const maxDuration = 60;

function diffKeys(before: UserLabel[], after: UserLabel[]): string[] {
  const prev = new Map(before.map((l) => [l.key, l]));
  const keys: string[] = [];
  for (const l of after) {
    const p = prev.get(l.key);
    if (!p || p.name !== l.name || p.color !== l.color) keys.push(l.key);
  }
  return keys;
}

const reply = (ok: boolean, message: string, status = 200, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok, message, ...extra }, { status });

/**
 * Saves the user's categories and syncs them to Google Calendar.
 * Body: { "labels": [...] } to save, or { "action": "reset" } for the defaults.
 */
export async function POST(request: Request) {
  // JSON only: a cross-site form cannot send it without a CORS preflight, which this route never allows.
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return reply(false, "Send JSON.", 415);
  const env = readEnv();
  const jar = await cookies();
  const id = userIdFromSession(jar.get(SESSION_COOKIE)?.value, env.appSecret);
  const store = await getStore();
  const user = id ? await store.getUser(id) : null;
  if (!id || !user) return reply(false, "Sign in first.", 401);

  let body: { labels?: unknown; action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return reply(false, "Send JSON.", 400);
  }
  let customLabels: UserLabel[] | undefined;
  if (body?.action !== "reset") {
    const v = validateLabels(body?.labels);
    if (!v.labels) return reply(false, `Not saved. ${v.error ?? "The categories are not valid."}`, 400);
    customLabels = v.labels;
  }

  const before = effectiveLabels(user);
  user.customLabels = customLabels;
  user.customColors = undefined; // colors live inside the categories
  const after = effectiveLabels(user);
  const changed = diffKeys(before, after);

  const saved = await patchUser(store, id, (fresh) => {
    rememberLabelBaseline(fresh, effectiveLabels(fresh));
    fresh.customLabels = customLabels;
    fresh.customColors = undefined;
  });
  if (!saved) return reply(false, "Sign in first.", 401);
  if (!changed.length && after.length === before.length) return reply(true, "Saved.", 200, { updated: 0 });

  try {
    const refreshToken = decrypt(user.refreshTokenEnc, env.appSecret);
    const calendar = new CalendarClient(new RefreshTokenSource({ clientId: env.googleClientId, clientSecret: env.googleClientSecret }, refreshToken));
    const result = await applyLabelChanges(saved, calendar, changed);
    await patchUser(store, id, (fresh) => {
      fresh.labelIds = saved.labelIds;
      fresh.labelMode = saved.labelMode;
      fresh.labelModeReason = saved.labelModeReason;
      fresh.labelSynced = saved.labelSynced;
    });
    const what = saved.labelMode === "labels" ? "calendar labels" : "events";
    if (result.errors.length) return reply(false, `Saved, but ${result.errors.length} updates failed. ${result.errors[0]}`, 200, { updated: result.updated });
    return reply(true, `Saved. ${result.updated} ${what} updated.`, 200, { updated: result.updated });
  } catch (err) {
    return reply(false, `Saved, but Google Calendar was not updated. ${err instanceof Error ? err.message.slice(0, 160) : ""}`.trim(), 502);
  }
}
