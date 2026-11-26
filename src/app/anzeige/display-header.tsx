"use client";

/* eslint-disable @next/next/no-img-element -- Logo kommt aus /api/logo */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLiveStatus } from "@/components/live/live-events";
import { todayIso } from "@/lib/dates";
import { api } from "@/lib/api-client";

/** Nach so langer Zeit ohne Bedienung zurück zur Einteilung ab heute (Wandmonitor) */
const IDLE_RETURN_MS = 5 * 60_000;

const btn = "rounded border border-white/40 px-[0.5rem] py-[0.1rem] text-[0.9rem] font-semibold hover:bg-white/15";
const btnOn = "rounded border border-white bg-white px-[0.5rem] py-[0.1rem] text-[0.9rem] font-semibold text-brand-800";

export function DisplayHeader({
  companyName,
  logoUrl,
  count,
  mode,
  today,
  nav,
  canLeave,
  homeHref,
}: {
  companyName: string;
  logoUrl: string | null;
  count: number;
  mode: "plan" | "absences";
  today: string;
  /** Tage wechseln (nur Einteilung): Ziel-Links; isToday = Ansicht beginnt heute */
  nav?: { prev: string; next: string; isToday: boolean; start: string };
  canLeave: boolean;
  /** Standardansicht, zu der nach Inaktivität zurückgekehrt wird */
  homeHref: string;
}) {
  const router = useRouter();
  const live = useLiveStatus();
  const [now, setNow] = useState<Date | null>(null);
  const atHome = mode === "plan" && (nav?.isToday ?? true);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(d);
      if (todayIso(d) !== today) router.refresh();
    };
    tick();
    const t = setInterval(tick, 20_000);
    const r = setInterval(() => router.refresh(), 10 * 60_000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [today, router]);

  // Wandmonitor: nach einigen Minuten ohne Bedienung zurück zur Einteilung ab heute
  useEffect(() => {
    if (atHome) return;
    let timer = setTimeout(() => router.push(homeHref), IDLE_RETURN_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.push(homeHref), IDLE_RETURN_MS);
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [atHome, homeHref, router]);

  return (
    <header className="no-print flex shrink-0 flex-wrap items-center gap-x-[1rem] gap-y-[0.3rem] bg-brand-700 px-[1rem] py-[0.4rem] pt-[max(0.4rem,env(safe-area-inset-top))] text-white">
      {logoUrl && (
        <span className="flex h-[2.2rem] items-center rounded bg-white px-[0.3rem] py-[0.2rem]">
          <img src={logoUrl} alt="" className="h-full object-contain" onLoad={() => window.dispatchEvent(new Event("resize"))} />
        </span>
      )}
      <span className="text-[1.4rem] font-bold">{companyName}</span>

      <span className="flex items-center gap-[0.4rem]">
        <Link href={`/anzeige?tage=${count}`} className={mode === "plan" ? btnOn : btn}>
          Einteilung
        </Link>
        <Link href={`/anzeige/abwesenheiten?tage=${count}`} className={mode === "absences" ? btnOn : btn}>
          Abwesenheiten
        </Link>
      </span>

      {mode === "plan" && nav && (
        <span className="flex items-center gap-[0.3rem]">
          <Link href={nav.prev} className={btn} aria-label="Einen Tag zurück">
            ◀
          </Link>
          <Link href={`/anzeige?tage=${count}`} className={nav.isToday ? btnOn : btn}>
            Heute
          </Link>
          <Link href={nav.next} className={btn} aria-label="Einen Tag vor">
            ▶
          </Link>
        </span>
      )}

      <span className="ml-auto flex items-center gap-[0.8rem] text-[1rem]">
        <span className={`inline-flex items-center gap-[0.3rem] ${live === "live" ? "" : "opacity-70"}`}>
          <span className={`inline-block size-[0.6rem] rounded-full ${live === "live" ? "bg-green-400" : "bg-amber-300"}`} />
          {live === "live" ? "Live" : "Verbinde …"}
        </span>
        {mode === "plan" && (
          <span className="flex overflow-hidden rounded border border-white/40 text-[0.9rem]">
            {[3, 5].map((n) => (
              <Link
                key={n}
                href={`/anzeige?tage=${n}${nav && !nav.isToday ? `&datum=${nav.start}` : ""}`}
                className={`px-[0.5rem] py-[0.1rem] font-semibold ${count === n ? "bg-white text-brand-800" : "hover:bg-white/15"}`}
              >
                {n} Tage
              </Link>
            ))}
          </span>
        )}
        <button
          type="button"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
          className={btn}
          title="Vollbild ein/aus"
        >
          ⛶ Vollbild
        </button>
        {canLeave ? (
          <Link href="/planung" className={btn} title="Zurück zur Planung">
            ✕
          </Link>
        ) : (
          <button
            type="button"
            className={btn}
            title="Monitor-Benutzer abmelden"
            onClick={async () => {
              if (!confirm("Monitor wirklich abmelden? Danach muss sich jemand neu anmelden, damit die Anzeige wieder läuft.")) return;
              try {
                await api("/api/auth/logout", { method: "POST" });
              } finally {
                // Voller Seitenwechsel: Client-Zustand und CSRF-Token verwerfen
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.assign("/login");
              }
            }}
          >
            ⏻ Abmelden
          </button>
        )}
        <span className="min-w-[4.5rem] text-right text-[1.6rem] font-bold tabular-nums">
          {now ? now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }) : ""}
        </span>
      </span>
    </header>
  );
}
