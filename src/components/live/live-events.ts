"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

export type LiveScope = "planning" | "absences" | "masterdata" | "all";
export type LiveEvent = { scope: LiveScope; dates: string[]; self: boolean; at: number };
export type LiveStatus = "connecting" | "live" | "offline";

// Eine gemeinsame SSE-Verbindung pro Browser-Tab
let source: EventSource | null = null;
let status: LiveStatus = "connecting";
let everConnected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(e: LiveEvent) => void>();
const statusListeners = new Set<() => void>();

function setStatus(next: LiveStatus) {
  if (status === next) return;
  status = next;
  statusListeners.forEach((l) => l());
}

function emit(e: LiveEvent) {
  listeners.forEach((l) => l(e));
}

function connect() {
  if (source || typeof window === "undefined") return;
  setStatus("connecting");
  const es = new EventSource("/api/events");
  source = es;
  es.addEventListener("hello", () => {
    // Nach einem Verbindungsabbruch einmal alles neu laden (es könnten Änderungen fehlen)
    if (everConnected) emit({ scope: "all", dates: [], self: false, at: Date.now() });
    everConnected = true;
    setStatus("live");
  });
  es.addEventListener("change", (m) => {
    try {
      emit(JSON.parse((m as MessageEvent).data) as LiveEvent);
    } catch {
      /* ungültige Nachricht ignorieren */
    }
  });
  es.addEventListener("logout", () => {
    es.close();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Sitzung beendet: voller Neustart
    window.location.href = "/login";
  });
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) {
      // Browser versucht es nicht mehr selbst (z. B. 401/502): später neu verbinden
      setStatus("offline");
      source = null;
      if (!reconnectTimer && listeners.size > 0) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (listeners.size > 0) connect();
        }, 15_000);
      }
    } else {
      setStatus("connecting");
    }
  };
}

function subscribe(listener: (e: LiveEvent) => void) {
  listeners.add(listener);
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      // kurz warten: beim Seitenwechsel meldet sich gleich der nächste Abonnent an
      closeTimer = setTimeout(() => {
        if (listeners.size === 0) {
          source?.close();
          source = null;
          setStatus("connecting");
        }
      }, 5_000);
    }
  };
}

/** Auf Live-Änderungen reagieren (Handler darf sich jederzeit ändern) */
export function useLiveEvents(handler: (e: LiveEvent) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => subscribe((e) => ref.current(e)), []);
}

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    () => status,
    () => "connecting" as LiveStatus,
  );
}

/** Mehrere schnelle Ereignisse zu einem Neuladen bündeln */
export function useDebounced(fn: () => void, ms = 300) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fnRef.current(), ms);
  };
}
