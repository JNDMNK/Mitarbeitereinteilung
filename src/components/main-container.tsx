"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Hauptbereich: die Planung nutzt auf großen Bildschirmen die volle Breite */
export function MainContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const wide = pathname === "/planung" || pathname.startsWith("/planung/");
  return <main className={`mx-auto p-3 md:p-6 ${wide ? "max-w-screen-2xl 2xl:max-w-none" : "max-w-screen-2xl"}`}>{children}</main>;
}
