import { sign, verify } from "./crypto";

export const SESSION_COOKIE = "gjl_session";
export const STATE_COOKIE = "gjl_oauth_state";
const SESSION_DAYS = 365;

export function sessionCookieValue(userId: string, secret: string): string {
  return sign(JSON.stringify({ uid: userId, iat: Date.now() }), secret);
}

export function userIdFromSession(cookie: string | undefined, secret: string): string | null {
  const payload = verify(cookie, secret);
  if (!payload) return null;
  try {
    const { uid } = JSON.parse(payload) as { uid?: string };
    return typeof uid === "string" && uid ? uid : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86_400,
};

export const stateCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};
