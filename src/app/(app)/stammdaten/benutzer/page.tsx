import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { db } from "@/server/db";
import { requirePagePermission } from "@/server/page-auth";
import { listUsers } from "@/server/services/users";
import { UserAdmin } from "./user-admin";

export const metadata: Metadata = { title: "Benutzer" };

export default async function UsersPage() {
  const { user } = await requirePagePermission("admin.users");
  const [users, employees] = await Promise.all([
    listUsers(),
    db.employee.findMany({
      where: { active: true },
      select: { id: true, firstName: true, lastName: true, shortName: true, user: { select: { id: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/stammdaten" className="text-brand-700 hover:underline">
          ← Stammdaten
        </Link>
      </div>
      <PageHeader title="Benutzer" description="Logins, Rollen und Passwörter verwalten" />
      <UserAdmin
        currentUserId={user.id}
        users={users.map((u) => ({
          ...u,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          lockedUntil: u.lockedUntil && u.lockedUntil > new Date() ? u.lockedUntil.toISOString() : null,
        }))}
        employees={employees.map((e) => ({
          id: e.id,
          label: `${e.lastName}, ${e.firstName} (${e.shortName})`,
          linkedUserId: e.user?.id ?? null,
        }))}
      />
    </>
  );
}
