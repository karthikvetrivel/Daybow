import { NextResponse } from "next/server";
import { randomToken } from "@/lib/crypto";
import { missingConfig, readEnv, resolveBaseUrl } from "@/lib/env";
import { authorizationUrl } from "@/lib/google";
import { STATE_COOKIE, stateCookieOptions } from "@/lib/session";

export async function GET(request: Request) {
  const env = readEnv();
  const base = resolveBaseUrl(env, request);
  if (missingConfig(env).length) return NextResponse.redirect(new URL("/?error=config", base));
  const state = randomToken();
  const url = authorizationUrl(
    { clientId: env.googleClientId, clientSecret: env.googleClientSecret, redirectUri: `${base}/api/auth/callback` },
    state,
  );
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, { ...stateCookieOptions, secure: base.startsWith("https://") });
  return res;
}
