"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useDebounced, useLiveEvents, useLiveStatus, type LiveScope } from "./live-events";

/**
 * Für Server-Seiten: bei passenden Live-Änderungen neu laden.
 * Ohne Live-Verbindung regelmäßig und beim Zurückkehren in die App.
 */
export function LiveRefresh({ scopes, fallbackMs = 60_000 }: { scopes: LiveScope[]; fallbackMs?: number }) {
  const router = useRouter();
  const status = useLiveStatus();
  const refresh = useDebounced(() => router.refresh(), 300);

  useLiveEvents((e) => {
    if (e.scope === "all" || scopes.includes(e.scope)) refresh();
  });

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const t = status === "live" ? null : setInterval(onVisible, fallbackMs);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (t) clearInterval(t);
    };
  }, [router, status, fallbackMs]);

  return null;
}
