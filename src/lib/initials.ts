/** Kürzel eines Benutzers: eigenes Kürzel > Kürzel des verknüpften Mitarbeiters > aus dem Benutzernamen */
export function userInitials(u: { username: string; initials?: string | null; employee?: { shortName: string } | null }): string {
  if (u.initials?.trim()) return u.initials.trim().toUpperCase();
  if (u.employee?.shortName) return u.employee.shortName;
  const parts = u.username.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1].slice(0, 2)).toUpperCase();
  return u.username.slice(0, 3).toUpperCase();
}
