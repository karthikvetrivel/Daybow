/**
 * Google sign-in for the extension. Uses the OAuth implicit flow through
 * chrome.identity.launchWebAuthFlow, so no client secret ships in the
 * extension. Silent renewals reuse the browser's Google session.
 */
import { SCOPES } from "../../lib/google";

declare const __GOOGLE_CLIENT_ID__: string;

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const TOKEN_KEY = "google_token";

interface StoredToken {
  accessToken: string;
  expiresAt: number;
  email: string;
}

export class SignedOutError extends Error {
  constructor() {
    super("Not signed in to Google");
  }
}

function authUrl(interactive: boolean, loginHint?: string): string {
  const p = new URLSearchParams({
    client_id: __GOOGLE_CLIENT_ID__,
    redirect_uri: chrome.identity.getRedirectURL(),
    response_type: "token",
    scope: SCOPES.join(" "),
    include_granted_scopes: "true",
    prompt: interactive ? "consent" : "none",
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `${AUTH_URL}?${p.toString()}`;
}

async function readStored(): Promise<StoredToken | null> {
  const r = await chrome.storage.local.get(TOKEN_KEY);
  return (r[TOKEN_KEY] as StoredToken | undefined) ?? null;
}

async function fetchEmail(token: string): Promise<string> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  const j = (await res.json()) as { email?: string };
  return (j.email ?? "").toLowerCase();
}

/** Runs the auth flow and stores the token. Throws when the user cancels or Google refuses. */
export async function signIn(interactive: boolean, loginHint?: string): Promise<StoredToken> {
  const redirect = await chrome.identity.launchWebAuthFlow({ url: authUrl(interactive, loginHint), interactive });
  if (!redirect) throw new SignedOutError();
  const hash = new URL(redirect).hash.replace(/^#/, "");
  const q = new URLSearchParams(hash);
  const error = q.get("error");
  const accessToken = q.get("access_token");
  if (error || !accessToken) throw new Error(error ?? "no access token returned");
  const granted = new Set((q.get("scope") ?? "").split(/\s+/));
  for (const s of SCOPES) if (s.startsWith("https://") && !granted.has(s)) throw new Error("Calendar permission was not granted. Sign in again and tick the calendar permissions.");
  const expiresAt = Date.now() + Number(q.get("expires_in") ?? 3600) * 1000;
  const email = await fetchEmail(accessToken);
  const stored: StoredToken = { accessToken, expiresAt, email };
  await chrome.storage.local.set({ [TOKEN_KEY]: stored });
  return stored;
}

/** A valid access token, renewed silently when needed. */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  const stored = await readStored();
  if (!stored) throw new SignedOutError();
  if (!forceRefresh && Date.now() < stored.expiresAt - 60_000) return stored.accessToken;
  try {
    const fresh = await signIn(false, stored.email);
    return fresh.accessToken;
  } catch (err) {
    throw new SignedOutError();
  }
}

export async function currentEmail(): Promise<string | null> {
  return (await readStored())?.email ?? null;
}

/** When the stored access token expires (ms since epoch), or null when signed out. */
export async function tokenExpiresAt(): Promise<number | null> {
  return (await readStored())?.expiresAt ?? null;
}

export async function signOut(): Promise<void> {
  const stored = await readStored();
  await chrome.storage.local.remove(TOKEN_KEY);
  if (stored?.accessToken) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(stored.accessToken)}`, { method: "POST" });
    } catch {
      // best effort
    }
  }
}
