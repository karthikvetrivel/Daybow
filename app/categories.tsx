"use client";

import { useEffect, useRef } from "react";
import { MAX_USER_LABELS, type UserLabel } from "@/lib/taxonomy";
import { mountCategoryCalendar } from "@/ui/category-calendar";
import "@/ui/category-calendar.css";

/** The calendar-style categories editor, saving through /api/settings. */
export function CategoriesEditor({ labels, note }: { labels: UserLabel[]; note?: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const editor = mountCategoryCalendar(host.current, {
      labels,
      note,
      save: async (next) => {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(next ? { labels: next } : { action: "reset" }),
        });
        const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
        return { ok: Boolean(res.ok && body?.ok), message: body?.message ?? `Not saved. The server answered ${res.status}.` };
      },
      onChange: (next) => {
        const pill = document.getElementById("catcount");
        if (pill) pill.textContent = `${next.length} of ${MAX_USER_LABELS}`;
      },
    });
    return () => editor.destroy();
    // The editor keeps its own state after the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={host} />;
}
