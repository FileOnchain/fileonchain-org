import "server-only";

import { and, count, desc, eq } from "drizzle-orm";
import {
  db,
  organizationMembers,
  organizations,
  users,
  type OrganizationRole,
} from "@/lib/db";

/**
 * Organization service. Role model:
 *   - owner  — everything, including delete; cannot leave or be removed.
 *   - admin  — rename, add members, remove members (not admins/owner).
 *   - member — read-only; can leave.
 * All operations are scoped by the acting user's membership row.
 */

/** Domain error carrying an HTTP status; routes forward it as-is. */
export class OrgError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
  memberCount: number;
  createdAt: Date;
}

export interface OrganizationMemberInfo {
  userId: string;
  name: string | null;
  email: string | null;
  role: OrganizationRole;
  joinedAt: Date;
}

export interface OrganizationDetail extends OrganizationSummary {
  members: OrganizationMemberInfo[];
}

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "org";

const membershipOf = async (
  userId: string,
  orgId: string,
): Promise<OrganizationRole | null> => {
  const [row] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.orgId, orgId),
        eq(organizationMembers.userId, userId),
      ),
    )
    .limit(1);
  return row?.role ?? null;
};

export const listOrganizations = async (
  userId: string,
): Promise<OrganizationSummary[]> => {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: organizationMembers.role,
      createdAt: organizations.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.orgId))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(desc(organizations.createdAt));

  return Promise.all(
    rows.map(async (row) => {
      const [{ value: memberCount }] = await db
        .select({ value: count() })
        .from(organizationMembers)
        .where(eq(organizationMembers.orgId, row.id));
      return { ...row, memberCount };
    }),
  );
};

export const getOrganization = async (
  userId: string,
  orgId: string,
): Promise<OrganizationDetail> => {
  const role = await membershipOf(userId, orgId);
  if (!role) throw new OrgError(404, "Organization not found");

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) throw new OrgError(404, "Organization not found");

  const members = await db
    .select({
      userId: organizationMembers.userId,
      name: users.name,
      email: users.email,
      role: organizationMembers.role,
      joinedAt: organizationMembers.joinedAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.orgId, orgId))
    .orderBy(organizationMembers.joinedAt);

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    role,
    memberCount: members.length,
    createdAt: org.createdAt,
    members,
  };
};

export const createOrganization = async (
  userId: string,
  name: string,
): Promise<OrganizationSummary> => {
  const base = slugify(name);
  // Retry with a numeric suffix if the slug is taken.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const [existing] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    if (existing) continue;

    const org = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(organizations)
        .values({ name, slug, ownerId: userId })
        .returning();
      await tx
        .insert(organizationMembers)
        .values({ orgId: created.id, userId, role: "owner" });
      return created;
    });
    return { ...org, role: "owner", memberCount: 1 };
  }
  throw new OrgError(409, "Could not find a free slug for that name");
};

export const renameOrganization = async (
  userId: string,
  orgId: string,
  name: string,
): Promise<void> => {
  const role = await membershipOf(userId, orgId);
  if (!role) throw new OrgError(404, "Organization not found");
  if (role === "member")
    throw new OrgError(403, "Only owners and admins can rename");
  await db
    .update(organizations)
    .set({ name })
    .where(eq(organizations.id, orgId));
};

export const deleteOrganization = async (
  userId: string,
  orgId: string,
): Promise<void> => {
  const role = await membershipOf(userId, orgId);
  if (!role) throw new OrgError(404, "Organization not found");
  if (role !== "owner")
    throw new OrgError(403, "Only the owner can delete an organization");
  await db.delete(organizations).where(eq(organizations.id, orgId));
};

export const addOrganizationMember = async (
  userId: string,
  orgId: string,
  email: string,
  role: Exclude<OrganizationRole, "owner"> = "member",
): Promise<OrganizationMemberInfo> => {
  const actorRole = await membershipOf(userId, orgId);
  if (!actorRole) throw new OrgError(404, "Organization not found");
  if (actorRole === "member")
    throw new OrgError(403, "Only owners and admins can add members");

  const [target] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (!target)
    throw new OrgError(404, "No FileOnChain account with that email");

  const existing = await membershipOf(target.id, orgId);
  if (existing) throw new OrgError(409, "Already a member");

  const [row] = await db
    .insert(organizationMembers)
    .values({ orgId, userId: target.id, role })
    .returning();
  return {
    userId: target.id,
    name: target.name,
    email: target.email,
    role: row.role,
    joinedAt: row.joinedAt,
  };
};

export const removeOrganizationMember = async (
  userId: string,
  orgId: string,
  targetUserId: string,
): Promise<void> => {
  const actorRole = await membershipOf(userId, orgId);
  if (!actorRole) throw new OrgError(404, "Organization not found");

  const targetRole = await membershipOf(targetUserId, orgId);
  if (!targetRole) throw new OrgError(404, "Member not found");
  if (targetRole === "owner")
    throw new OrgError(403, "The owner cannot leave or be removed");

  const isSelf = userId === targetUserId;
  const canRemoveOthers =
    actorRole === "owner" || (actorRole === "admin" && targetRole === "member");
  if (!isSelf && !canRemoveOthers)
    throw new OrgError(403, "Not allowed to remove that member");

  await db
    .delete(organizationMembers)
    .where(
      and(
        eq(organizationMembers.orgId, orgId),
        eq(organizationMembers.userId, targetUserId),
      ),
    );
};
