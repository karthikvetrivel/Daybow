import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readEnv, resolveBaseUrl } from "@/lib/env";
import { labelUser } from "@/lib/runner";
import { SESSION_COOKIE, userIdFromSession } from "@/lib/session";
import { getStore } from "@/lib/store";

export const maxDuration = 60;

export async function POST(request: Request) {
  const env = readEnv();
  const base = resolveBaseUrl(env, request);
  const jar = await cookies();
  const id = userIdFromSession(jar.get(SESSION_COOKIE)?.value, env.appSecret);
  if (!id) return NextResponse.redirect(new URL("/", base), 303);
  const store = await getStore();
  const user = await store.getUser(id);
  if (user) await labelUser(user, store, { env, baseUrl: base, maxClassifications: 150 });
  return NextResponse.redirect(new URL("/", base), 303);
}
