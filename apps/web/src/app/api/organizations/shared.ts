import { asRouteError } from "@/lib/auth";
import type {
  OrganizationDetail,
  OrganizationMemberInfo,
  OrganizationSummary,
} from "@/lib/server/organizations";

/** Shared serialization + error mapping for the organization routes. */

export const serializeOrg = (org: OrganizationSummary) => ({
  id: org.id,
  name: org.name,
  slug: org.slug,
  role: org.role,
  memberCount: org.memberCount,
  createdAt: org.createdAt.toISOString(),
});

export const serializeMember = (member: OrganizationMemberInfo) => ({
  userId: member.userId,
  name: member.name,
  email: member.email,
  role: member.role,
  joinedAt: member.joinedAt.toISOString(),
});

export const serializeOrgDetail = (org: OrganizationDetail) => ({
  ...serializeOrg(org),
  members: org.members.map(serializeMember),
});

/**
 * `OrgError` extends `HttpError`, so the shared route-error mapper handles
 * it directly — kept as a named alias so the org routes read domain-first.
 */
export const asOrgError = asRouteError;
