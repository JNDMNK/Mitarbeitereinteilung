"use client";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? "";
}

/** Datei-Upload (multipart) mit CSRF-Header */
export async function apiUpload<T = unknown>(url: string, form: FormData): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "X-CSRF-Token": csrfToken() },
      body: form,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError(0, "Keine Verbindung zum Server. Bitte Netzwerk prüfen.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new ApiClientError(res.status, data.error ?? `Fehler ${res.status}`, data.code);
  return data as T;
}

/** fetch-Wrapper: JSON, CSRF-Header, deutsche Fehlermeldungen */
export async function api<T = unknown>(
  url: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(method !== "GET" ? { "X-CSRF-Token": csrfToken() } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
    });
  } catch {
    throw new ApiClientError(0, "Keine Verbindung zum Server. Bitte Netzwerk prüfen.");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* kein JSON */
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; code?: string; details?: unknown };
    if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/login")) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Sitzung abgelaufen: voller Neustart
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiClientError(res.status, d.error ?? `Fehler ${res.status}`, d.code, d.details);
  }
  return data as T;
}
