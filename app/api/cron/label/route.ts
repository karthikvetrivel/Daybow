import { NextResponse } from "next/server";
import { readEnv, resolveBaseUrl } from "@/lib/env";
import { labelUser } from "@/lib/runner";
import { getStore } from "@/lib/store";

export const maxDuration = 300;

/**
 * Daily sweep. Labels anything the webhook missed and renews push channels.
 * Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" automatically.
 */
export async function GET(request: Request) {
  const env = readEnv();
  const auth = request.headers.get("authorization") ?? "";
  if (!env.cronSecret || auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const base = env.baseUrl || resolveBaseUrl(env, request);
  const store = await getStore();
  const ids = await store.listUserIds();
  const results: Record<string, unknown> = {};
  for (const id of ids) {
    const user = await store.getUser(id);
    if (!user || user.paused) continue;
    try {
      const s = await labelUser(user, store, { env, baseUrl: base });
      results[user.email] = { labeled: s.labeled, scanned: s.scanned, lowConfidence: s.lowConfidence, errors: s.errors.length };
    } catch (err) {
      results[user.email] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return NextResponse.json({ users: ids.length, results });
}
