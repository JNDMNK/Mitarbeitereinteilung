"use client";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

export function LogoutButton({ variant = "secondary", className }: { variant?: "secondary" | "ghost"; className?: string }) {
  return (
    <Button
      variant={variant}
      className={className}
      onClick={async () => {
        try {
          await api("/api/auth/logout", { method: "POST" });
        } finally {
          // Voller Seitenwechsel: Client-Zustand und CSRF-Token verwerfen
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/login");
        }
      }}
    >
      Abmelden
    </Button>
  );
}
