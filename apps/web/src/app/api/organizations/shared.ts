import { NextResponse } from "next/server";
import { asRouteError } from "@/lib/auth";
import {
  OrgError,
  type OrganizationDetail,
  type OrganizationMemberInfo,
  type OrganizationSummary,
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

/** OrgError → its HTTP status; everything else via asRouteError. */
export const asOrgError = (error: unknown): NextResponse =>
  error instanceof OrgError
    ? NextResponse.json({ error: error.message }, { status: error.status })
    : asRouteError(error);
