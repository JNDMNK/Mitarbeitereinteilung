import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";
import { requirePagePermission } from "@/server/page-auth";

export const metadata: Metadata = { title: "Abwesenheiten" };

export default async function AbsencesPage() {
  await requirePagePermission("absences.view");
  return (
    <>
      <PageHeader title="Abwesenheiten" />
      <Placeholder text="Die Abwesenheitsübersicht folgt in Schritt 4." />
    </>
  );
}
