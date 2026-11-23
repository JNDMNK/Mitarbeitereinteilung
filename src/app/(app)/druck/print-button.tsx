"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return <Button onClick={() => window.print()}>🖨 Drucken / als PDF speichern</Button>;
}
