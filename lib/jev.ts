import { jevCriteria, type LabelCriteria } from "./taxonomy";

export interface JevAnswer {
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
  model: string;
  inputTokens: number;
}

export type Criteria = Record<string, LabelCriteria | string>;

export interface JevClient {
  classify(state: unknown, criteria?: Criteria, signal?: AbortSignal): Promise<JevAnswer>;
}

export interface JevOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  timeoutMs?: number;
}

export class JevError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Jev request failed: ${status} ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

const INSTRUCTIONS = {
  what: "Pick the single label that best describes this calendar event for the calendar owner.",
  how: [
    "Read the title first; it carries most of the signal.",
    "other_attendee_count is the number of invited people besides the owner. Zero means the owner is alone unless the title names a companion.",
    "source 'gmail' means Google created the event from an email such as a flight, hotel, or restaurant confirmation.",
    "Work meetings usually have attendees, a video link, or a 'Name <> Name' style title.",
    "A title about working with other_attendee_count 0 and no other person named is 'focus', not 'meeting'.",
    "Choose 'other' when nothing fits well or the title is too vague to decide.",
  ],
};

const QUESTION_KEY = "label";

export function buildRequest(state: unknown, model: string, criteria: Criteria = jevCriteria()) {
  return {
    model,
    state,
    questions: {
      [QUESTION_KEY]: {
        type: "choice",
        instructions: INSTRUCTIONS,
        criteria,
      },
    },
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    });
  });
}

export function createJevClient(opts: JevOptions): JevClient {
  const model = opts.model ?? "jev-latest";
  const baseUrl = (opts.baseUrl ?? "https://api.typesafe.ai/v1").replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxAttempts = opts.maxAttempts ?? 4;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  if (!opts.apiKey) throw new Error("TYPESAFE_API_KEY is not set");

  return {
    async classify(state, criteria, signal) {
      const body = JSON.stringify(buildRequest(state, model, criteria));
      let lastErr: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        signal?.addEventListener("abort", () => ac.abort());
        try {
          const res = await fetchImpl(`${baseUrl}/systemone`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${opts.apiKey}`,
              "Content-Type": "application/json",
            },
            body,
            signal: ac.signal,
          });
          const text = await res.text();
          if (res.ok) {
            const json = JSON.parse(text);
            const a = json.answers?.[QUESTION_KEY];
            if (!a || a.type !== "choice") throw new JevError(res.status, `unexpected answer shape: ${text}`);
            return {
              label: String(a.choice),
              confidence: Number(a.confidence ?? 0),
              probabilities: a.probabilities ?? {},
              model: String(json.model ?? model),
              inputTokens: Number(json.usage?.input_tokens ?? 0),
            };
          }
          const retryable = res.status === 429 || res.status === 529 || res.status >= 500;
          lastErr = new JevError(res.status, text);
          if (!retryable || attempt === maxAttempts) throw lastErr;
          const retryAfter = Number(res.headers.get("retry-after"));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * 2 ** (attempt - 1), signal);
        } catch (err) {
          lastErr = err;
          if (err instanceof JevError) throw err;
          if (signal?.aborted || attempt === maxAttempts) throw err;
          await sleep(400 * 2 ** (attempt - 1), signal);
        } finally {
          clearTimeout(timer);
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    },
  };
}
