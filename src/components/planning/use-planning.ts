"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import type { PlanningAction } from "@/lib/planning-schemas";
import type { PlanningData, PlanningResult } from "@/lib/planning-types";

export type Toast = { id: number; tone: "success" | "warning" | "error"; lines: string[] };

export function planningKey(from: string, to: string) {
  return ["planning", from, to] as const;
}

export function usePlanningData(from: string, to: string, initial?: PlanningData) {
  return useQuery({
    queryKey: planningKey(from, to),
    queryFn: ({ signal }) => api<PlanningData>(`/api/planning?from=${from}&to=${to}`, { signal }),
    initialData: initial && initial.from === from && initial.to === to ? initial : undefined,
    // Fallback, bis Echtzeit-Updates (SSE) aktiv sind
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
    placeholderData: (prev) => prev,
  });
}

/** Planungsaktion ausführen, Rückmeldung als Toast, danach neu laden */
export function usePlanningActions() {
  const qc = useQueryClient();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((tone: Toast["tone"], lines: string[]) => {
    if (lines.length === 0) return;
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, tone, lines }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "success" ? 4000 : 9000);
  }, []);

  const mutation = useMutation({
    mutationFn: ({ action, body }: { action: PlanningAction; body: unknown; success?: string }) =>
      api<PlanningResult>(`/api/planning/${action}`, { body }),
    onSuccess: (res, vars) => {
      if (res.warnings.length) push("warning", [...(vars.success ? [vars.success] : []), ...res.messages, ...res.warnings]);
      else push("success", [...(vars.success ? [vars.success] : []), ...res.messages]);
    },
    onError: (err) => {
      push("error", [err instanceof ApiClientError ? err.message : "Aktion fehlgeschlagen."]);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["planning"] }),
  });

  const run = useCallback(
    (action: PlanningAction, body: unknown, success?: string) => mutation.mutateAsync({ action, body, success }).then(() => true, () => false),
    [mutation],
  );

  return { run, busy: mutation.isPending, toasts, dismiss: (id: number) => setToasts((t) => t.filter((x) => x.id !== id)) };
}
