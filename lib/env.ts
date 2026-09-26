/** Reads configuration once. Missing required values surface as clear errors. */
export interface Env {
  googleClientId: string;
  googleClientSecret: string;
  typesafeApiKey: string;
  appSecret: string;
  cronSecret: string;
  baseUrl: string; // may be empty in local dev; then derived from the request
  jevModel: string;
  minConfidence: number;
  windowPastDays: number;
  windowFutureDays: number;
}

export function readEnv(): Env {
  const e = process.env;
  return {
    googleClientId: e.GOOGLE_CLIENT_ID ?? "",
    googleClientSecret: e.GOOGLE_CLIENT_SECRET ?? "",
    typesafeApiKey: e.TYPESAFE_API_KEY ?? "",
    appSecret: e.APP_SECRET ?? "",
    cronSecret: e.CRON_SECRET ?? "",
    baseUrl: (e.BASE_URL ?? "").replace(/\/+$/, ""),
    jevModel: e.JEV_MODEL ?? "jev-latest",
    minConfidence: numberOr(e.LABEL_MIN_CONFIDENCE, 0.3),
    windowPastDays: numberOr(e.LABEL_WINDOW_PAST_DAYS, 7),
    windowFutureDays: numberOr(e.LABEL_WINDOW_FUTURE_DAYS, 60),
  };
}

function numberOr(v: string | undefined, d: number): number {
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
}

/** Names of the variables that must be set before the product works. */
export function missingConfig(env: Env): string[] {
  const missing: string[] = [];
  if (!env.googleClientId) missing.push("GOOGLE_CLIENT_ID");
  if (!env.googleClientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!env.typesafeApiKey) missing.push("TYPESAFE_API_KEY");
  if (!env.appSecret || env.appSecret.length < 16) missing.push("APP_SECRET (16+ characters)");
  return missing;
}

/** The public origin for redirects and webhooks. */
export function resolveBaseUrl(env: Env, request: Request): string {
  if (env.baseUrl) return env.baseUrl;
  const h = request.headers;
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
