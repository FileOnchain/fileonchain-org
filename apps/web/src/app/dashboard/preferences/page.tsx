import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserPreferences } from "@/lib/server/preferences";
import { listOrganizations } from "@/lib/server/organizations";
import PreferencesForm from "@/components/dashboard/preferences/PreferencesForm";
import OrganizationsPanel from "@/components/dashboard/preferences/OrganizationsPanel";

export const metadata: Metadata = { title: "Preferences" };

export default async function PreferencesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/dashboard/preferences");

  const [preferences, organizations] = await Promise.all([
    getUserPreferences(session.user.id),
    listOrganizations(session.user.id),
  ]);

  return (
    <div className="space-y-6">
      <PreferencesForm initialPreferences={preferences} />
      <OrganizationsPanel
        currentUserId={session.user.id}
        initialOrganizations={organizations.map((org) => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          role: org.role,
          memberCount: org.memberCount,
          createdAt: org.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
