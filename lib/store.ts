import { promises as fs } from "node:fs";
import path from "node:path";

export interface RunSummary {
  at: string;
  /** label edits made in Google Calendar and adopted into the categories this run */
  adopted?: number;
  durationMs: number;
  mode: "labels" | "colors";
  scanned: number;
  candidates: number;
  classified: number;
  labeled: number;
  lowConfidence: number;
  alreadyLabeled: number;
  labeledByKey: Record<string, number>;
  errors: string[];
}

export interface ProcessedEntry {
  /** ISO time the decision was made */
  t: string;
  /** content hash at decision time */
  h: string;
  /** label key applied, "skip" (low confidence / other), or "cleared" (user removed our label) */
  r: string;
}

export interface WatchChannel {
  channelId: string;
  resourceId: string;
  /** Unix ms */
  expiration: number;
}

export interface UserRecord {
  id: string;
  email: string;
  refreshTokenEnc: string;
  connectedAt: string;
  timeZone: string;
  labelMode: "labels" | "colors" | "unknown";
  /** why the account fell back to colors, for the status page */
  labelModeReason?: string;
  /** label key -> Google label id (labels mode only) */
  labelIds: Record<string, string>;
  /** master event id -> decision */
  processed: Record<string, ProcessedEntry>;
  lastRun?: RunSummary;
  watch?: WatchChannel;
  paused?: boolean;
  /** label key -> hex chosen by the user (older records); absent keys use the defaults */
  customColors?: Record<string, string>;
  /** the user's own category set; absent means the defaults */
  customLabels?: import("./taxonomy").UserLabel[];
  /**
   * label key -> the name and color last agreed with Google. A difference on
   * Google's side means someone edited the label in Google Calendar, and the
   * edit is adopted instead of being overwritten.
   */
  labelSynced?: Record<string, { name: string; color: string }>;
}

export interface Store {
  getUser(id: string): Promise<UserRecord | null>;
  putUser(user: UserRecord): Promise<void>;
  deleteUser(id: string): Promise<void>;
  listUserIds(): Promise<string[]>;
}

export function newUser(fields: Pick<UserRecord, "id" | "email" | "refreshTokenEnc" | "timeZone">): UserRecord {
  return {
    ...fields,
    connectedAt: new Date().toISOString(),
    labelMode: "unknown",
    labelIds: {},
    processed: {},
  };
}

/* ---------- Local JSON file (development) ---------- */

export class FileStore implements Store {
  private file: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(file = path.join(process.cwd(), ".data", "store.json")) {
    this.file = file;
  }

  private async readAll(): Promise<Record<string, UserRecord>> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw err;
    }
  }

  private async writeAll(data: Record<string, UserRecord>): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await fs.rename(tmp, this.file);
  }

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  getUser(id: string) {
    return this.locked(async () => (await this.readAll())[id] ?? null);
  }
  putUser(user: UserRecord) {
    return this.locked(async () => {
      const all = await this.readAll();
      all[user.id] = user;
      await this.writeAll(all);
    });
  }
  deleteUser(id: string) {
    return this.locked(async () => {
      const all = await this.readAll();
      delete all[id];
      await this.writeAll(all);
    });
  }
  listUserIds() {
    return this.locked(async () => Object.keys(await this.readAll()));
  }
}

/* ---------- Vercel Blob (private blobs) ---------- */

export class BlobStore implements Store {
  private prefix: string;
  constructor(prefix = "users/") {
    this.prefix = prefix;
  }
  private key(id: string) {
    return `${this.prefix}${id}.json`;
  }
  async getUser(id: string): Promise<UserRecord | null> {
    const { get } = await import("@vercel/blob");
    const res = await get(this.key(id), { access: "private", useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const text = await new Response(res.stream).text();
    return JSON.parse(text) as UserRecord;
  }
  async putUser(user: UserRecord): Promise<void> {
    const { put } = await import("@vercel/blob");
    await put(this.key(user.id), JSON.stringify(user), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
  }
  async deleteUser(id: string): Promise<void> {
    const { del } = await import("@vercel/blob");
    await del(this.key(id));
  }
  async listUserIds(): Promise<string[]> {
    const { list } = await import("@vercel/blob");
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: this.prefix, cursor, limit: 1000 });
      for (const b of page.blobs) {
        const m = b.pathname.slice(this.prefix.length).match(/^([^/]+)\.json$/);
        if (m) ids.push(m[1]);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return ids;
  }
}

/* ---------- Upstash Redis (also Vercel KV env names) ---------- */

export class RedisStore implements Store {
  private redis: import("@upstash/redis").Redis;
  private setKey = "gcal-jev:users";
  constructor(redis: import("@upstash/redis").Redis) {
    this.redis = redis;
  }
  private key(id: string) {
    return `gcal-jev:user:${id}`;
  }
  async getUser(id: string) {
    const v = await this.redis.get<UserRecord>(this.key(id));
    return v ?? null;
  }
  async putUser(user: UserRecord) {
    await this.redis.set(this.key(user.id), user);
    await this.redis.sadd(this.setKey, user.id);
  }
  async deleteUser(id: string) {
    await this.redis.del(this.key(id));
    await this.redis.srem(this.setKey, id);
  }
  async listUserIds() {
    return (await this.redis.smembers(this.setKey)) as string[];
  }
}

/* ---------- Selection ---------- */

let cached: Store | null = null;

export async function getStore(): Promise<Store> {
  if (cached) return cached;
  const e = process.env;
  const forced = e.STORE_BACKEND; // "file" | "blob" | "redis" (optional override)
  if (forced === "file") {
    cached = new FileStore();
  } else if (e.BLOB_READ_WRITE_TOKEN && forced !== "redis") {
    cached = new BlobStore();
  } else if ((e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) || (e.KV_REST_API_URL && e.KV_REST_API_TOKEN)) {
    const { Redis } = await import("@upstash/redis");
    cached = new RedisStore(
      new Redis({
        url: e.UPSTASH_REDIS_REST_URL ?? e.KV_REST_API_URL!,
        token: e.UPSTASH_REDIS_REST_TOKEN ?? e.KV_REST_API_TOKEN!,
      }),
    );
  } else {
    cached = new FileStore();
  }
  return cached;
}

export function storeName(): string {
  const e = process.env;
  if (e.STORE_BACKEND === "file") return "local file";
  if (e.BLOB_READ_WRITE_TOKEN && e.STORE_BACKEND !== "redis") return "Vercel Blob";
  if ((e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN) || (e.KV_REST_API_URL && e.KV_REST_API_TOKEN)) return "Redis";
  return "local file";
}

/**
 * Read-modify-write against the freshest stored copy. Keeps the window for
 * lost updates between concurrent writers (webhook, cron, settings) tiny.
 */
export async function patchUser(store: Store, id: string, mutate: (fresh: UserRecord) => void): Promise<UserRecord | null> {
  const fresh = await store.getUser(id);
  if (!fresh) return null;
  mutate(fresh);
  await store.putUser(fresh);
  return fresh;
}
