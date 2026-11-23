import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";
import { requirePagePermission } from "@/server/page-auth";

export const metadata: Metadata = { title: "Planung" };

export default async function PlanningPage() {
  await requirePagePermission("planning.view");
  return (
    <>
      <PageHeader title="Planung" description="3-Tages-Ansicht" />
      <Placeholder text="Die 3-Tages-Planung folgt in Schritt 5." />
    </>
  );
}
