"use client";

import * as React from "react";
import { FiUsers } from "react-icons/fi";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useFormDraft } from "@/hooks/useFormDraft";
import { trackEvent } from "@/lib/analytics";

/** Wire shapes returned by /api/organizations — dates as ISO strings. */
export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
  memberCount: number;
  createdAt: string;
}

interface OrgMember {
  userId: string;
  name: string | null;
  email: string | null;
  role: "owner" | "admin" | "member";
  joinedAt: string;
}

interface OrgDetail extends OrgSummary {
  members: OrgMember[];
}

interface OrganizationsPanelProps {
  currentUserId: string;
  initialOrganizations: OrgSummary[];
}

const ROLE_BADGE: Record<OrgMember["role"], "info" | "success" | "default"> = {
  owner: "success",
  admin: "info",
  member: "default",
};

const request = async <T,>(
  url: string,
  init?: RequestInit,
): Promise<T> => {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
};

/**
 * OrganizationsPanel — create and manage team workspaces. Owners/admins can
 * rename and manage members; members can leave. Membership is by email of
 * an existing FileOnChain account.
 */
export const OrganizationsPanel = ({
  currentUserId,
  initialOrganizations,
}: OrganizationsPanelProps) => {
  const { toast } = useToast();
  const [orgs, setOrgs] = React.useState(initialOrganizations);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [managedOrgId, setManagedOrgId] = React.useState<string | null>(null);

  // Keeps a half-typed organization name across a page refresh.
  useFormDraft(
    "org-create",
    { newName },
    { restore: (draft) => setNewName(draft.newName) },
  );

  const refresh = React.useCallback(async () => {
    const data = await request<{ organizations: OrgSummary[] }>(
      "/api/organizations",
    );
    setOrgs(data.organizations);
  }, []);

  const createOrg = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await request("/api/organizations", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewName("");
      await refresh();
      trackEvent("organization", { action: "create" });
      toast({ title: "Organization created", variant: "success" });
    } catch (error) {
      toast({
        title: "Could not create organization",
        description: (error as Error).message,
        variant: "danger",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card padding="lg">
      <CardHeader>
        <CardTitle>Organizations</CardTitle>
        <CardDescription>
          Share an account context with your team. Add members by the email
          they signed up with.
        </CardDescription>
      </CardHeader>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <Input
            label="New organization"
            placeholder="e.g. Acme Labs"
            value={newName}
            maxLength={64}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createOrg();
            }}
          />
        </div>
        <Button onClick={createOrg} isLoading={creating} disabled={!newName.trim()}>
          Create
        </Button>
      </div>

      <div className="mt-6">
        {orgs.length === 0 ? (
          <EmptyState
            icon={<FiUsers size={20} />}
            title="No organizations yet"
            description="Create one to collaborate with your team."
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {orgs.map((org) => (
              <li
                key={org.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {org.name}
                    </span>
                    <code className="font-mono text-xs text-muted">{org.slug}</code>
                    <Badge variant={ROLE_BADGE[org.role]} size="sm">
                      {org.role}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {org.memberCount}{" "}
                    {org.memberCount === 1 ? "member" : "members"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setManagedOrgId(org.id)}
                >
                  Manage
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {managedOrgId && (
        <ManageOrgModal
          orgId={managedOrgId}
          currentUserId={currentUserId}
          onClose={() => setManagedOrgId(null)}
          onChanged={refresh}
        />
      )}
    </Card>
  );
};

interface ManageOrgModalProps {
  orgId: string;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

const ManageOrgModal = ({
  orgId,
  currentUserId,
  onClose,
  onChanged,
}: ManageOrgModalProps) => {
  const { toast } = useToast();
  const [detail, setDetail] = React.useState<OrgDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<"member" | "admin">("member");
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  // Invite fields only — `name` reloads from the server on every mutation.
  useFormDraft(
    `org-invite:${orgId}`,
    { inviteEmail, inviteRole },
    {
      restore: (draft) => {
        setInviteEmail(draft.inviteEmail);
        setInviteRole(draft.inviteRole);
      },
    },
  );

  const load = React.useCallback(async () => {
    try {
      const data = await request<{ organization: OrgDetail }>(
        `/api/organizations/${orgId}`,
      );
      setDetail(data.organization);
      setName(data.organization.name);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const run = async (
    action: () => Promise<unknown>,
    successTitle: string,
    gaAction: "rename" | "delete" | "member_add" | "member_remove",
    { closeAfter = false }: { closeAfter?: boolean } = {},
  ) => {
    setBusy(true);
    try {
      await action();
      trackEvent("organization", { action: gaAction });
      toast({ title: successTitle, variant: "success" });
      await onChanged();
      if (closeAfter) onClose();
      else await load();
    } catch (e) {
      toast({
        title: "Action failed",
        description: (e as Error).message,
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const canManage = detail?.role === "owner" || detail?.role === "admin";
  const isOwner = detail?.role === "owner";

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={detail ? `Manage ${detail.name}` : "Manage organization"}
      size="md"
    >
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : !detail ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-6">
          {canManage && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full max-w-xs">
                <Input
                  label="Name"
                  value={name}
                  maxLength={64}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                isLoading={busy}
                disabled={!name.trim() || name.trim() === detail.name}
                onClick={() =>
                  run(
                    () =>
                      request(`/api/organizations/${orgId}`, {
                        method: "PATCH",
                        body: JSON.stringify({ name: name.trim() }),
                      }),
                    "Organization renamed",
                    "rename",
                  )
                }
              >
                Rename
              </Button>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
              Members
            </p>
            <ul className="divide-y divide-border rounded-md border border-border">
              {detail.members.map((member) => {
                const isSelf = member.userId === currentUserId;
                const removable =
                  member.role !== "owner" &&
                  (isSelf ||
                    detail.role === "owner" ||
                    (detail.role === "admin" && member.role === "member"));
                return (
                  <li
                    key={member.userId}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">
                        {member.name ?? member.email ?? member.userId}
                        {isSelf && (
                          <span className="ml-1 text-xs text-muted">(you)</span>
                        )}
                      </p>
                      {member.email && (
                        <p className="truncate text-xs text-muted">
                          {member.email}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={ROLE_BADGE[member.role]} size="sm">
                        {member.role}
                      </Badge>
                      {removable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                request(
                                  `/api/organizations/${orgId}/members/${member.userId}`,
                                  { method: "DELETE" },
                                ),
                              isSelf ? "Left organization" : "Member removed",
                              "member_remove",
                              { closeAfter: isSelf },
                            )
                          }
                        >
                          {isSelf ? "Leave" : "Remove"}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {canManage && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full max-w-[14rem]">
                <Input
                  label="Add member by email"
                  type="email"
                  placeholder="teammate@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <div className="w-28">
                <Select
                  label="Role"
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value as "member" | "admin")
                  }
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </Select>
              </div>
              <Button
                size="sm"
                isLoading={busy}
                disabled={!inviteEmail.includes("@")}
                onClick={() =>
                  run(
                    async () => {
                      await request(`/api/organizations/${orgId}/members`, {
                        method: "POST",
                        body: JSON.stringify({
                          email: inviteEmail.trim(),
                          role: inviteRole,
                        }),
                      });
                      setInviteEmail("");
                    },
                    "Member added",
                    "member_add",
                  )
                }
              >
                Add
              </Button>
            </div>
          )}

          {isOwner && (
            <div className="border-t border-border pt-4">
              {confirmDelete ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-danger">
                    Delete “{detail.name}” and all its memberships?
                  </p>
                  <Button
                    variant="danger"
                    size="sm"
                    isLoading={busy}
                    onClick={() =>
                      run(
                        () =>
                          request(`/api/organizations/${orgId}`, {
                            method: "DELETE",
                          }),
                        "Organization deleted",
                        "delete",
                        { closeAfter: true },
                      )
                    }
                  >
                    Yes, delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete organization
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default OrganizationsPanel;
