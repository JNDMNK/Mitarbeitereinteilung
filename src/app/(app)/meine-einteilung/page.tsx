import type { Metadata } from "next";
import { PageHeader, Placeholder } from "@/components/page-header";
import { requirePagePermission } from "@/server/page-auth";

export const metadata: Metadata = { title: "Meine Einteilung" };

export default async function MyAssignmentsPage() {
  const { user } = await requirePagePermission("planning.view");
  return (
    <>
      <PageHeader title="Meine Einteilung" />
      <Placeholder
        text={
          user.employeeId
            ? "Die persönliche Übersicht folgt in einem späteren Schritt."
            : "Ihr Benutzerkonto ist mit keinem Mitarbeiter verknüpft."
        }
      />
    </>
  );
}
