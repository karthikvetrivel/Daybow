import { describe, expect, it } from "vitest";
import { CalendarClient, GoogleApiError, StaticTokenSource } from "../lib/google";
import { createJevClient } from "../lib/jev";

/** Behaves like a browser's fetch: throws when called with a foreign `this`. */
function browserLikeFetch(this: unknown, _input: unknown, _init?: unknown): Promise<Response> {
  if (this !== undefined && this !== globalThis) return Promise.reject(new TypeError("Failed to execute 'fetch' on 'WorkerGlobalScope': Illegal invocation"));
  return Promise.resolve(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }));
}

describe("fetch is called the way browsers require", () => {
  it("CalendarClient", async () => {
    const client = new CalendarClient(new StaticTokenSource("t"), "primary", browserLikeFetch as typeof fetch);
    const err = await client.getCalendar().catch((e) => e);
    expect(err).toBeInstanceOf(GoogleApiError);
    expect((err as GoogleApiError).status).toBe(401);
  });

  it("Jev client", async () => {
    const jev = createJevClient({ apiKey: "k", fetchImpl: browserLikeFetch as typeof fetch, maxAttempts: 1 });
    const err = await jev.classify({ title: "x" }).catch((e) => e);
    expect(String(err)).toContain("401");
  });
});
