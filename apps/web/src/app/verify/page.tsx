"use client";

import * as React from "react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import VerifyPanel from "@/components/verify/VerifyPanel";

/**
 * /verify — public, in-browser verification of an evidence package. No
 * account, no wallet: the verifier runs locally (dynamic-imported inside
 * the panel so viem stays out of the initial bundle), and the optional
 * online pass talks only to public RPC endpoints.
 */
export default function VerifyPage() {
  return (
    <PageShell size="wide" padding="lg" atmosphere>
      <PageHeader
        className="mb-8"
        index="09"
        kicker="Verify"
        title="Verify an evidence package"
        lede="Paste an envelope — or drop the .json file — and every check runs in your browser: subject integrity, artifact and envelope signatures, receipts, key status. Supply the original bytes to prove integrity end-to-end; tick the online option to confirm settlement receipts against public RPCs. Nothing is uploaded to FileOnChain."
      />
      <VerifyPanel />
    </PageShell>
  );
}
