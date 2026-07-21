import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import {
  db,
  organizationMembers,
  projectMembers,
  projects,
  type ProjectRole,
} from "@/lib/db";
import { HttpError } from "@/lib/server/http-error";

/**
 * Project service — sub-org tenancy. Every project belongs to exactly one
 * org; project members must already be members of the parent org (the
 * service rejects adds that would create an inconsistent view). Project
 * roles are `lead` (manages quotas + signer + keys + members) and
 * `contributor` (can seal into the project).
 *
 * The Cloud-only fields (`project_id` columns on evidence_envelope and
 * upload_job, the quota counters read from those columns) live in DB
 * columns only — they are NEVER inserted into the envelope JSON itself
 * (CLAUDE.md:411-413). Same precedence that applies to org tenancy
 * extends one level down.
 */

export class ProjectError extends HttpError {}

export interface ProjectSummary {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  role: ProjectRole | null;
  memberCount: number;
  retentionDays: number | null;
  envelopesPerMonth: number | null;
  anchorsPerMonth: number | null;
  createdAt: Date;
}

export interface ProjectDetail extends ProjectSummary {
  description: string | null;
  bytesAnchoredPerMonth: number | null;
}

export interface ProjectMemberInfo {
  userId: string;
  role: ProjectRole;
  joinedAt: Date;
}

/** Same slugification rule used for orgs (mirror of
 *  `organizations.ts`). Internal because the service layer retries with
 *  a numeric suffix on collision. */
const slugify = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "project";

/** Assert the user holds one of `allowed` roles in `orgId`. Mirrors the
 *  existing `requireOrgRole` pattern. */
const requireOrgMembership = async (
  userId: string,
  orgId: string,
): Promise<void> => {
  const [row] = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.orgId, orgId),
        eq(organizationMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new ProjectError(404, "Organization not found");
};

/** Assert the user holds `required` role in `projectId`. Caller's
 *  membership at the org level is implicit (a project member must be an
 *  org member), so we don't re-check it here. */
const membershipOf = async (
  userId: string,
  projectId: string,
): Promise<ProjectRole | null> => {
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    )
    .limit(1);
  return row?.role ?? null;
};

/**
 * Resolve a project's org id. Used by `/api/v1/evidence` and
 * `/api/v1/anchor` to verify a project-scoped key's claim against the
 * parent org.
 */
export const getProjectOrgId = async (
  projectId: string,
): Promise<string | null> => {
  const [row] = await db
    .select({ orgId: projects.orgId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row?.orgId ?? null;
};

/**
 * Assert the user holds one of `allowed` roles in the project. Returns
 * the role on success; throws `ProjectError(404)` when not a member (no
 * info leak) and `ProjectError(403)` when the role is insufficient.
 * Use this from session-authed routes that mutate project-scoped
 * resources (members, signer, quotas).
 */
export const requireProjectRole = async (
  userId: string,
  projectId: string,
  allowed: ProjectRole[] = ["lead"],
): Promise<ProjectRole> => {
  const role = await membershipOf(userId, projectId);
  if (!role) throw new ProjectError(404, "Project not found");
  if (!allowed.includes(role))
    throw new ProjectError(403, `Requires one of: ${allowed.join(", ")}`);
  return role;
};

/** All projects under an org that the user can see. The user must be an
 *  org member; the listing is membership-filtered (a user only sees
 *  projects they themselves are in). Used by `/cloud/projects` and the
 *  CloudShell's project picker. */
export const listProjects = async (
  userId: string,
  orgId: string,
): Promise<ProjectSummary[]> => {
  await requireOrgMembership(userId, orgId);
  const rows = await db
    .select({
      id: projects.id,
      orgId: projects.orgId,
      name: projects.name,
      slug: projects.slug,
      retentionDays: projects.retentionDays,
      envelopesPerMonth: projects.envelopesPerMonth,
      anchorsPerMonth: projects.anchorsPerMonth,
      createdAt: projects.createdAt,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(
      and(
        eq(projectMembers.userId, userId),
        eq(projects.orgId, orgId),
      ),
    )
    .orderBy(desc(projects.createdAt));

  return Promise.all(
    rows.map(async (row) => {
      // role + memberCount are independent reads — fan them out so
      // the per-row cost is one round trip, not two. For a member
      // of N projects this turns the listing's tail from 2N
      // sequential SELECTs into N.
      const [role, countRow] = await Promise.all([
        membershipOf(userId, row.id),
        db
          .select({ value: count() })
          .from(projectMembers)
          .where(eq(projectMembers.projectId, row.id))
          .limit(1),
      ]);
      return { ...row, role, memberCount: Number(countRow[0]?.value ?? 0) };
    }),
  );
};

/** Single project detail with quota columns exposed. 404 when the user
 *  is not a project member. Membership check + project row fetch are
 *  independent reads — fan them out together so the detail endpoint
 *  pays one round trip instead of two. */
export const getProject = async (
  userId: string,
  projectId: string,
): Promise<ProjectDetail> => {
  const [role, project] = await Promise.all([
    membershipOf(userId, projectId),
    db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
      .then(([row]) => row),
  ]);
  if (!project) throw new ProjectError(404, "Project not found");
  if (!role) throw new ProjectError(404, "Project not found");
  return {
    id: project.id,
    orgId: project.orgId,
    name: project.name,
    slug: project.slug,
    role,
    memberCount: 0,
    retentionDays: project.retentionDays,
    envelopesPerMonth: project.envelopesPerMonth,
    anchorsPerMonth: project.anchorsPerMonth,
    bytesAnchoredPerMonth:
      project.bytesAnchoredPerMonth != null
        ? Number(project.bytesAnchoredPerMonth)
        : null,
    createdAt: project.createdAt,
    description: null,
  };
};

/** Create a project under an org. The caller must be an org member
 *  (any role) — once the project exists the caller is its first `lead`.
 *  Returns the new summary. */
export const createProject = async (
  userId: string,
  orgId: string,
  name: string,
): Promise<ProjectSummary> => {
  await requireOrgMembership(userId, orgId);
  const base = slugify(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const [existing] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.orgId, orgId), eq(projects.slug, slug)))
      .limit(1);
    if (existing) continue;

    const project = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(projects)
        .values({ orgId, name, slug, createdByUserId: userId })
        .returning();
      await tx
        .insert(projectMembers)
        .values({ projectId: created.id, userId, role: "lead" });
      return created;
    });
    return {
      id: project.id,
      orgId: project.orgId,
      name: project.name,
      slug: project.slug,
      role: "lead",
      memberCount: 1,
      retentionDays: project.retentionDays,
      envelopesPerMonth: project.envelopesPerMonth,
      anchorsPerMonth: project.anchorsPerMonth,
      createdAt: project.createdAt,
    };
  }
  throw new ProjectError(409, "Could not find a free slug for that name");
};

/** Rename a project. Lead-only. */
export const renameProject = async (
  userId: string,
  projectId: string,
  name: string,
): Promise<void> => {
  await requireProjectRole(userId, projectId, ["lead"]);
  await db.update(projects).set({ name }).where(eq(projects.id, projectId));
};

/** Delete a project (cascade removes members, signers, scoped keys,
 *  exports). Lead-only. */
export const deleteProject = async (
  userId: string,
  projectId: string,
): Promise<void> => {
  await requireProjectRole(userId, projectId, ["lead"]);
  await db.delete(projects).where(eq(projects.id, projectId));
};

/** Update quota columns. Lead-only. NULL means "no cap" (unlimited). */
export const updateProjectQuotas = async (
  userId: string,
  projectId: string,
  quotas: {
    envelopesPerMonth?: number | null;
    anchorsPerMonth?: number | null;
    bytesAnchoredPerMonth?: number | null;
    retentionDays?: number | null;
  },
): Promise<void> => {
  await requireProjectRole(userId, projectId, ["lead"]);
  const patch: Record<string, number | null | Date> = {};
  if (quotas.envelopesPerMonth !== undefined) {
    if (quotas.envelopesPerMonth !== null && quotas.envelopesPerMonth <= 0) {
      throw new ProjectError(
        400,
        "envelopesPerMonth must be a positive integer or null",
      );
    }
    patch.envelopesPerMonth = quotas.envelopesPerMonth;
  }
  if (quotas.anchorsPerMonth !== undefined) {
    if (quotas.anchorsPerMonth !== null && quotas.anchorsPerMonth <= 0) {
      throw new ProjectError(
        400,
        "anchorsPerMonth must be a positive integer or null",
      );
    }
    patch.anchorsPerMonth = quotas.anchorsPerMonth;
  }
  if (quotas.bytesAnchoredPerMonth !== undefined) {
    if (
      quotas.bytesAnchoredPerMonth !== null &&
      quotas.bytesAnchoredPerMonth <= 0
    ) {
      throw new ProjectError(
        400,
        "bytesAnchoredPerMonth must be a positive integer or null",
      );
    }
    patch.bytesAnchoredPerMonth = quotas.bytesAnchoredPerMonth;
  }
  if (quotas.retentionDays !== undefined) {
    if (quotas.retentionDays !== null && quotas.retentionDays <= 0) {
      throw new ProjectError(
        400,
        "retentionDays must be a positive integer or null",
      );
    }
    patch.retentionDays = quotas.retentionDays;
  }
  if (Object.keys(patch).length === 0) return;
  await db.update(projects).set(patch).where(eq(projects.id, projectId));
};

/** Add a project member. The user must already be an org member; we
 *  refuse to add a non-member because the project view filters down
 *  from the org. */
export const addProjectMember = async (
  userId: string,
  projectId: string,
  targetUserId: string,
  role: ProjectRole = "contributor",
): Promise<ProjectMemberInfo> => {
  await requireProjectRole(userId, projectId, ["lead"]);
  // Require the target to be an org member of the project's parent org.
  const [project] = await db
    .select({ orgId: projects.orgId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new ProjectError(404, "Project not found");
  const [membership] = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.orgId, project.orgId),
        eq(organizationMembers.userId, targetUserId),
      ),
    )
    .limit(1);
  if (!membership) {
    throw new ProjectError(
      409,
      "That user is not a member of the project's organization",
    );
  }

  const existing = await membershipOf(targetUserId, projectId);
  if (existing) throw new ProjectError(409, "Already a project member");

  const [row] = await db
    .insert(projectMembers)
    .values({ projectId, userId: targetUserId, role })
    .returning();
  return {
    userId: row.userId,
    role: row.role,
    joinedAt: row.joinedAt,
  };
};

/** Remove a project member. Leads cannot remove themselves (the org's
 *  owner is always implicitly a project lead; we let them re-add
 *  themselves through the org membership if needed). */
export const removeProjectMember = async (
  userId: string,
  projectId: string,
  targetUserId: string,
): Promise<void> => {
  await requireProjectRole(userId, projectId, ["lead"]);
  const targetRole = await membershipOf(targetUserId, projectId);
  if (!targetRole) throw new ProjectError(404, "Project member not found");
  if (userId === targetUserId) {
    throw new ProjectError(
      403,
      "Project leads cannot remove themselves; delete the project instead",
    );
  }
  await db
    .delete(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, targetUserId),
      ),
    );
};

/** List a project's members. Lead or contributor both see the roster. */
export const listProjectMembers = async (
  userId: string,
  projectId: string,
): Promise<ProjectMemberInfo[]> => {
  await requireProjectRole(userId, projectId, ["lead", "contributor"]);
  const rows = await db
    .select({
      userId: projectMembers.userId,
      role: projectMembers.role,
      joinedAt: projectMembers.joinedAt,
    })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId));
  return rows;
};
