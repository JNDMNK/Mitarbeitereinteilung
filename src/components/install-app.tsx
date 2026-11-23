"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const noop = () => () => {};

/** „App installieren“: Android/Chrome per Dialog, iPhone mit Anleitung */
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const standalone = useSyncExternalStore(
    noop,
    () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false,
  );
  const ios = useSyncExternalStore(noop, () => /iphone|ipad|ipod/i.test(navigator.userAgent), () => false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || installed) return <p className="text-green-800">✓ Die App ist auf diesem Gerät installiert.</p>;
  if (prompt) {
    return (
      <Button
        onClick={async () => {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          if (choice.outcome === "accepted") setInstalled(true);
          setPrompt(null);
        }}
      >
        📲 App auf diesem Gerät installieren
      </Button>
    );
  }
  if (ios) {
    return (
      <p>
        Auf dem iPhone/iPad in Safari unten auf <strong>Teilen</strong> (Quadrat mit Pfeil) tippen und <strong>„Zum Home-Bildschirm“</strong> wählen.
      </p>
    );
  }
  return <p className="text-muted">Im Browser-Menü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.</p>;
}
