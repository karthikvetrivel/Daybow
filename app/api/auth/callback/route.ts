import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { encrypt, sha256Hex } from "@/lib/crypto";
import { readEnv, resolveBaseUrl } from "@/lib/env";
import { CalendarClient, StaticTokenSource, decodeIdToken, exchangeCode, hasCalendarScopes } from "@/lib/google";
import { labelUser } from "@/lib/runner";
import { SESSION_COOKIE, STATE_COOKIE, sessionCookieOptions, sessionCookieValue } from "@/lib/session";
import { getStore, newUser } from "@/lib/store";

export const maxDuration = 60;

export async function GET(request: Request) {
  const env = readEnv();
  const base = resolveBaseUrl(env, request);
  const fail = (code: string) => NextResponse.redirect(new URL(`/?error=${code}`, base));

  const url = new URL(request.url);
  if (url.searchParams.get("error")) return fail("denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) return fail("state");

  const cfg = { clientId: env.googleClientId, clientSecret: env.googleClientSecret, redirectUri: `${base}/api/auth/callback` };
  const tokens = await exchangeCode(cfg, code);
  if (!hasCalendarScopes(tokens.scope)) return fail("scopes");
  if (!tokens.refresh_token) return fail("no_refresh");
  const email = decodeIdToken(tokens.id_token ?? "").email?.toLowerCase();
  if (!email) return fail("email");

  const id = sha256Hex(email).slice(0, 32);
  const store = await getStore();
  const existing = await store.getUser(id);
  let timeZone = existing?.timeZone ?? "UTC";
  try {
    timeZone = await new CalendarClient(new StaticTokenSource(tokens.access_token)).getTimeZone();
  } catch {
    // keep the previous or default zone
  }
  const refreshTokenEnc = encrypt(tokens.refresh_token, env.appSecret);
  const user = existing
    ? { ...existing, email, refreshTokenEnc, timeZone, paused: false }
    : newUser({ id, email, refreshTokenEnc, timeZone });
  await store.putUser(user);

  // First labeling pass right away so the user sees results on the next page.
  try {
    await labelUser(user, store, { env, baseUrl: base, maxClassifications: 150 });
  } catch (err) {
    user.lastRun = {
      at: new Date().toISOString(),
      durationMs: 0,
      mode: user.labelMode === "colors" ? "colors" : "labels",
      scanned: 0,
      candidates: 0,
      classified: 0,
      labeled: 0,
      lowConfidence: 0,
      alreadyLabeled: 0,
      labeledByKey: {},
      errors: [err instanceof Error ? err.message : String(err)],
    };
    await store.putUser(user);
  }

  const res = NextResponse.redirect(new URL("/?connected=1", base));
  res.cookies.set(SESSION_COOKIE, sessionCookieValue(id, env.appSecret), { ...sessionCookieOptions, secure: base.startsWith("https://") });
  res.cookies.delete(STATE_COOKIE);
  return res;
}
