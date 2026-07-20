"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Org picker for multi-org `/cloud/*` surfaces. On change it navigates to
 * the current path with `?orgId=<id>` set, preserving any other query params
 * (e.g. the search `query`). Server components read `searchParams.orgId` and
 * re-scope accordingly — so this one control drives search, retention, and
 * the signer editor. Single-org users still see it (disabled-feeling but
 * explicit) so the active scope is never ambiguous.
 */
export const OrgSelect = ({
  orgs,
  selectedOrgId,
  label = "Organization",
  id = "cloud-org-select",
}: {
  orgs: Array<{ id: string; name: string }>;
  selectedOrgId: string | null;
  label?: string;
  id?: string;
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("orgId", event.target.value);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <select
        id={id}
        value={selectedOrgId ?? ""}
        onChange={onChange}
        className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default OrgSelect;
