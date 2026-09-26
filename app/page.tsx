import { cookies } from "next/headers";
import { missingConfig, readEnv } from "@/lib/env";
import { SESSION_COOKIE, userIdFromSession } from "@/lib/session";
import { getStore, storeName, type UserRecord } from "@/lib/store";
import { MAX_USER_LABELS, defaultUserLabels, effectiveLabels } from "@/lib/taxonomy";
import { CategoriesEditor } from "./categories";
import { AppBar, GoogleG, WeekPreview } from "./ui";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  config: "The server is missing configuration. The owner must set the environment variables listed below.",
  denied: "Google sign-in was cancelled. Nothing was changed.",
  state: "The sign-in link expired or did not match. Try again.",
  scopes: "Calendar access was not granted. Sign in again and keep the calendar permission ticked.",
  email: "Google did not return an email address for the account.",
  no_refresh: "Google did not return a long-lived token. Sign in again.",
};

const TILE = ["sky", "butter", "mint", "blush"];

async function currentUser(secret: string): Promise<UserRecord | null> {
  const jar = await cookies();
  const id = userIdFromSession(jar.get(SESSION_COOKIE)?.value, secret);
  if (!id) return null;
  try {
    return await (await getStore()).getUser(id);
  } catch {
    return null;
  }
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const env = readEnv();
  const missing = missingConfig(env);
  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : undefined;
  const user = missing.length ? null : await currentUser(env.appSecret);

  if (user) {
    const run = user.lastRun;
    const labels = effectiveLabels(user);
    const byKey = new Map(labels.map((l) => [l.key, l]));
    const counts = run ? Object.entries(run.labeledByKey).sort((a, b) => b[1] - a[1]) : [];
    const fallback = user.labelMode === "colors";
    return (
      <>
        <AppBar email={user.email} />
        <main>
          <section className="card">
            <div className="cardhead">
              <h2>Your calendar is connected</h2>
              <span className="pill ok"><span className="dot" /> Labeling on</span>
            </div>
            <p className="muted">New events get a label within seconds. A daily sweep catches the rest.</p>
            {run ? (
              <>
                <div className="stats">
                  {[
                    [run.labeled, "labeled last run"],
                    [run.alreadyLabeled, "already labeled"],
                    [run.lowConfidence, "left alone"],
                    [run.scanned, "events scanned"],
                  ].map(([n, t], i) => (
                    <div className={`stat ${TILE[i]}`} key={String(t)}><b>{n}</b><span>{t}</span></div>
                  ))}
                </div>
                <p className="muted small" style={{ marginTop: 10 }}>
                  Last run {new Date(run.at).toLocaleString()} · {run.mode === "labels" ? "named labels" : `event colors (named labels unavailable${user.labelModeReason ? `: ${user.labelModeReason}` : ""})`}
                </p>
                {counts.length > 0 && (
                  <ul className="legend">
                    {counts.map(([k, n]) => (
                      <li key={k} style={{ ["--c" as string]: byKey.get(k)?.color ?? "#999" }}><span className="swatch" style={{ background: byKey.get(k)?.color ?? "#999" }} />{byKey.get(k)?.name ?? k} · {n}</li>
                    ))}
                  </ul>
                )}
                {run.errors.length > 0 && (
                  <ul className="errors">{run.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul>
                )}
              </>
            ) : (
              <p>No run yet.</p>
            )}
            <div className="row">
              <form method="post" action="/api/run"><button className="btn tonal" type="submit">Label now</button></form>
              <form method="post" action="/api/disconnect"><button className="btn danger" type="submit">Disconnect and delete my data</button></form>
            </div>
          </section>

          <section className="card">
            <div className="cardhead"><h2>Categories</h2><span className="pill" id="catcount">{labels.length} of {MAX_USER_LABELS}</span></div>
            <CategoriesEditor labels={labels} note={fallback ? "This account uses Google's 11 event colors, so each color snaps to the closest one on the calendar." : undefined} />
            <p className="muted small" style={{ marginTop: 10 }}>
              Each event's title, time, attendees, and source go to Jev, which returns one category with a confidence score. Events where nothing fits, or below {env.minConfidence} confidence, stay untouched. Labels you set or remove by hand are never overridden.
            </p>
          </section>
        </main>
      </>
    );
  }

  const labels = defaultUserLabels();
  return (
    <>
      <AppBar />
      <main>
        <section className="hero">
          <h1>Your calendar, color-coded by itself</h1>
          <p className="muted">Sign in once. Every event gets a pastel category label within seconds, now and as new events arrive.</p>
          {errorKey && ERRORS[errorKey] && <div className="alert">{ERRORS[errorKey]}</div>}
          {missing.length > 0 ? (
            <div className="alert">
              <p>Not configured yet. Set these environment variables: <code>{missing.join(", ")}</code>. Storage backend: {storeName()}.</p>
            </div>
          ) : (
            <div className="row">
              <a className="btn google" href="/api/auth/google"><GoogleG /> Sign in with Google</a>
              <span className="muted small">One click here, then Google asks you to confirm calendar access. Nothing to type.</span>
            </div>
          )}
        </section>
        <section className="card">
          <div className="cardhead"><h2>How your week will look</h2></div>
          <WeekPreview labels={labels} />
          <ul className="legend">
            {labels.map((l) => (
              <li key={l.key} style={{ ["--c" as string]: l.color }}><span className="swatch" style={{ background: l.color }} />{l.name}</li>
            ))}
          </ul>
          <p className="muted small" style={{ marginTop: 12 }}>
            Runs on your primary calendar. Only event labels change. Titles, times, guests, and notifications are never touched. You can rename, recolor, add, or remove categories after signing in. Disconnect at any time to delete your data. <a href="/privacy">Privacy</a>.
          </p>
        </section>
      </main>
    </>
  );
}
