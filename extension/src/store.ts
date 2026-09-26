/** Per-user record and settings, kept in chrome.storage.local. */
import type { UserRecord } from "../../lib/store";

declare const __TYPESAFE_API_KEY__: string;

const USER_KEY = "user";
const SETTINGS_KEY = "settings";

export interface Settings {
  jevApiKey: string;
  minConfidence: number;
  windowPastDays: number;
  windowFutureDays: number;
  sweepMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  jevApiKey: __TYPESAFE_API_KEY__ || "",
  minConfidence: 0.3,
  windowPastDays: 7,
  windowFutureDays: 60,
  sweepMinutes: 5,
};

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...((r[SETTINGS_KEY] as Partial<Settings> | undefined) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export function newUserRecord(email: string, timeZone: string): UserRecord {
  return {
    id: email,
    email,
    refreshTokenEnc: "", // the extension keeps its token elsewhere
    connectedAt: new Date().toISOString(),
    timeZone,
    labelMode: "unknown",
    labelIds: {},
    processed: {},
  };
}

export async function getUser(): Promise<UserRecord | null> {
  const r = await chrome.storage.local.get(USER_KEY);
  return (r[USER_KEY] as UserRecord | undefined) ?? null;
}

export async function putUser(user: UserRecord): Promise<void> {
  await chrome.storage.local.set({ [USER_KEY]: user });
}

export async function clearUser(): Promise<void> {
  await chrome.storage.local.remove(USER_KEY);
}
