import { NextResponse } from "next/server";
import { after } from "next/server";
import { verify } from "@/lib/crypto";
import { readEnv, resolveBaseUrl } from "@/lib/env";
import { labelUser } from "@/lib/runner";
import { getStore } from "@/lib/store";

export const maxDuration = 60;

/** Runs started less than this long ago make a notification wait, never drop. */
const SPACING_MS = 8_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const startedAt = (u: { lastRun?: { at: string } } | null) => (u?.lastRun ? new Date(u.lastRun.at).getTime() : 0);

/**
 * Google push notification: something on the user's calendar changed.
 * Google sends one within seconds of a create or edit, and also for every
 * patch this app makes, so notifications arrive in bursts. A burst is
 * absorbed by spacing runs out, and no notification is ever discarded.
 */
export async function POST(request: Request) {
  const env = readEnv();
  const state = request.headers.get("x-goog-resource-state");
  const token = request.headers.get("x-goog-channel-token");
  const channelId = request.headers.get("x-goog-channel-id");
  if (state === "sync") return new NextResponse(null, { status: 200 });
  const userId = verify(token, env.appSecret);
  if (!userId) return new NextResponse(null, { status: 200 }); // never make Google retry a bad channel

  const base = env.baseUrl || resolveBaseUrl(env, request);
  const notifiedAt = Date.now();
  after(async () => {
    const store = await getStore();
    let user = await store.getUser(userId);
    if (!user || user.paused) return;
    if (user.watch && channelId && user.watch.channelId !== channelId) return; // stale channel

    const since = notifiedAt - startedAt(user);
    if (since < SPACING_MS) {
      await sleep(SPACING_MS - since + 250);
      const again = await store.getUser(userId);
      if (!again || again.paused) return;
      // A run that started after this notification already listed the change.
      if (startedAt(again) >= notifiedAt) return;
      user = again;
    }
    try {
      await labelUser(user, store, { env, baseUrl: base, maxClassifications: 100 });
    } catch (err) {
      console.error("webhook run failed", userId, err);
    }
  });
  return new NextResponse(null, { status: 200 });
}
