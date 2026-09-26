import type { GEvent } from "./features";

export const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendars",
];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export class GoogleApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, what: string) {
    super(`Google ${what} failed: ${status} ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}

export function authorizationUrl(cfg: OAuthConfig, state: string, loginHint?: string): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `${AUTH_URL}?${p.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
  token_type: string;
}

export async function exchangeCode(cfg: OAuthConfig, code: string): Promise<TokenResponse> {
  const f = cfg.fetchImpl ?? fetch;
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new GoogleApiError(res.status, text, "code exchange");
  return JSON.parse(text) as TokenResponse;
}

export async function refreshAccessToken(cfg: Pick<OAuthConfig, "clientId" | "clientSecret" | "fetchImpl">, refreshToken: string): Promise<TokenResponse> {
  const f = cfg.fetchImpl ?? fetch;
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new GoogleApiError(res.status, text, "token refresh");
  return JSON.parse(text) as TokenResponse;
}

export async function revokeToken(token: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await fetchImpl(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" });
}

/** The id_token came straight from Google's token endpoint over TLS, so its payload is trusted here. */
export function decodeIdToken(idToken: string): { email?: string; sub?: string; email_verified?: boolean } {
  const payload = idToken.split(".")[1];
  if (!payload) return {};
  const b64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function hasCalendarScopes(scope: string): boolean {
  const granted = new Set(scope.split(/\s+/));
  return SCOPES.filter((s) => s.startsWith("https://")).every((s) => granted.has(s));
}

/* ---------- Calendar API ---------- */

export interface GLabel {
  id?: string;
  name?: string;
  backgroundColor?: string;
}

export interface GCalendar {
  id?: string;
  summary?: string;
  timeZone?: string;
  labelProperties?: { eventLabels?: GLabel[] };
}

export interface WatchRequest {
  id: string;
  address: string;
  token?: string;
  expiration?: number;
}

export interface WatchResponse {
  id: string;
  resourceId: string;
  expiration?: string;
}

/** What the labeler needs from Google. Tests use an in-memory fake. */
export interface ListOptions {
  /** only events changed at or after this time (deleted ones are included too) */
  updatedMin?: string;
}

export interface CalendarApi {
  listEvents(timeMin: string, timeMax: string, labelVersion: boolean, opts?: ListOptions): Promise<GEvent[]>;
  /** One event, or null when it does not exist. */
  getEvent(eventId: string, labelVersion: boolean): Promise<GEvent | null>;
  getCalendar(): Promise<GCalendar>;
  setLabels(labels: GLabel[]): Promise<void>;
  patchEvent(eventId: string, body: { eventLabelId?: string; colorId?: string }, mode: "labels" | "colors"): Promise<void>;
}

export interface AccessTokenSource {
  getAccessToken(forceRefresh?: boolean): Promise<string>;
}

export class RefreshTokenSource implements AccessTokenSource {
  private token: string | null = null;
  private expiresAt = 0;
  constructor(
    private cfg: Pick<OAuthConfig, "clientId" | "clientSecret" | "fetchImpl">,
    private refreshToken: string,
  ) {}
  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.token && Date.now() < this.expiresAt - 30_000) return this.token;
    const t = await refreshAccessToken(this.cfg, this.refreshToken);
    this.token = t.access_token;
    this.expiresAt = Date.now() + t.expires_in * 1000;
    return this.token;
  }
}

export class StaticTokenSource implements AccessTokenSource {
  constructor(private token: string) {}
  async getAccessToken() {
    return this.token;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class CalendarClient implements CalendarApi {
  private resolvedId: string | null = null;

  constructor(
    private tokens: AccessTokenSource,
    private calendarId = "primary",
    private fetchImpl: typeof fetch = fetch,
  ) {}

  /**
   * calendars.patch returns 404 for the "primary" alias, so every call uses the
   * calendar's real id, fetched once.
   */
  private async idPath(suffix = ""): Promise<string> {
    if (!this.resolvedId) {
      if (this.calendarId !== "primary") {
        this.resolvedId = this.calendarId;
      } else {
        const cal = await this.request<GCalendar>("GET", "/calendars/primary", {}, undefined, "calendars.get");
        this.resolvedId = cal.id ?? "primary";
      }
    }
    return `/calendars/${encodeURIComponent(this.resolvedId)}${suffix}`;
  }

  private async request<T>(method: string, pathname: string, query: Record<string, string | undefined>, body?: unknown, what = pathname): Promise<T> {
    const url = new URL(`${CAL_BASE}${pathname}`);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
    let refreshed = false;
    for (let attempt = 1; ; attempt++) {
      const token = await this.tokens.getAccessToken(refreshed);
      // Call fetch unbound: browsers reject `fetch` when `this` is not the global object.
      const doFetch = this.fetchImpl;
      const res = await doFetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res.ok) {
        if (res.status === 204) return undefined as T;
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }
      const text = await res.text();
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        continue;
      }
      const rateLimited = res.status === 429 || (res.status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(text));
      if ((rateLimited || res.status >= 500) && attempt < 4) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw new GoogleApiError(res.status, text, what);
    }
  }

  async listEvents(timeMin: string, timeMax: string, labelVersion: boolean, opts: ListOptions = {}): Promise<GEvent[]> {
    const out: GEvent[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.request<{ items?: GEvent[]; nextPageToken?: string }>(
        "GET",
        await this.idPath("/events"),
        {
          singleEvents: "true",
          orderBy: "startTime",
          timeMin,
          timeMax,
          maxResults: "250",
          showDeleted: opts.updatedMin ? undefined : "false",
          updatedMin: opts.updatedMin,
          pageToken,
          eventLabelVersion: labelVersion ? "1" : undefined,
        },
        undefined,
        "events.list",
      );
      out.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }

  async getCalendar(): Promise<GCalendar> {
    return this.request<GCalendar>("GET", await this.idPath(), { eventLabelVersion: "1" }, undefined, "calendars.get");
  }

  async setLabels(labels: GLabel[]): Promise<void> {
    await this.request("PATCH", await this.idPath(), { eventLabelVersion: "1" }, { labelProperties: { eventLabels: labels } }, "calendars.patch");
  }

  async patchEvent(eventId: string, body: { eventLabelId?: string; colorId?: string }, mode: "labels" | "colors"): Promise<void> {
    await this.request(
      "PATCH",
      await this.idPath(`/events/${encodeURIComponent(eventId)}`),
      { sendUpdates: "none", eventLabelVersion: mode === "labels" ? "1" : undefined },
      body,
      "events.patch",
    );
  }

  /** Like patchEvent, but returns the updated event (the fast path records its content). */
  patchEventReturning(eventId: string, body: { eventLabelId?: string; colorId?: string }, mode: "labels" | "colors"): Promise<GEvent> {
    return this.idPath(`/events/${encodeURIComponent(eventId)}`).then((path) =>
      this.request<GEvent>("PATCH", path, { sendUpdates: "none", eventLabelVersion: mode === "labels" ? "1" : undefined }, body, "events.patch"),
    );
  }

  async getEvent(eventId: string, labelVersion = true): Promise<GEvent | null> {
    try {
      return await this.request<GEvent>("GET", await this.idPath(`/events/${encodeURIComponent(eventId)}`), { eventLabelVersion: labelVersion ? "1" : undefined }, undefined, "events.get");
    } catch (err) {
      if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) return null;
      throw err;
    }
  }

  /** The settings endpoint needs an extra scope, so the calendar resource supplies the zone. */
  async getTimeZone(): Promise<string> {
    const cal = await this.request<GCalendar>("GET", await this.idPath(), {}, undefined, "calendars.get");
    return cal.timeZone ?? "UTC";
  }

  async watchEvents(req: WatchRequest): Promise<WatchResponse> {
    return this.request<WatchResponse>("POST", await this.idPath("/events/watch"), {}, { ...req, type: "web_hook" }, "events.watch");
  }

  async stopChannel(id: string, resourceId: string): Promise<void> {
    try {
      await this.request("POST", "/channels/stop", {}, { id, resourceId }, "channels.stop");
    } catch (err) {
      if (err instanceof GoogleApiError && err.status === 404) return;
      throw err;
    }
  }
}
