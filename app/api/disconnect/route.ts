import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto";
import { readEnv, resolveBaseUrl } from "@/lib/env";
import { CalendarClient, RefreshTokenSource, revokeToken } from "@/lib/google";
import { SESSION_COOKIE, userIdFromSession } from "@/lib/session";
import { getStore } from "@/lib/store";
import { stopWatch } from "@/lib/watch";

export async function POST(request: Request) {
  const env = readEnv();
  const base = resolveBaseUrl(env, request);
  const jar = await cookies();
  const id = userIdFromSession(jar.get(SESSION_COOKIE)?.value, env.appSecret);
  const res = NextResponse.redirect(new URL("/?disconnected=1", base), 303);
  res.cookies.delete(SESSION_COOKIE);
  if (!id) return res;

  const store = await getStore();
  const user = await store.getUser(id);
  if (user) {
    let refreshToken = "";
    try {
      refreshToken = decrypt(user.refreshTokenEnc, env.appSecret);
      const calendar = new CalendarClient(new RefreshTokenSource({ clientId: env.googleClientId, clientSecret: env.googleClientSecret }, refreshToken));
      await stopWatch(user, calendar);
    } catch {
      // The token may already be invalid. Deleting our copy is what matters.
    }
    if (refreshToken) await revokeToken(refreshToken).catch(() => undefined);
    await store.deleteUser(id);
  }
  return res;
}
