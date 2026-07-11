import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FiZap } from "react-icons/fi";
import { getChain } from "@fileonchain/sdk";
import { auth } from "@/lib/auth";
import { listFocatOrders } from "@/lib/server/focat-orders";
import { formatMicroUsdc } from "@/lib/usdc";
import { formatFocat } from "@/lib/focat";
import FormattedDate from "@/components/ui/FormattedDate";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import GetFocatButton from "@/components/dashboard/GetFocatButton";

export const metadata: Metadata = { title: "FOCAT" };

const PACK_LABELS: Record<string, string> = {
  "anchor-pack": "Anchor pack",
  "validator-starter": "Validator starter",
  custom: "Custom top-up",
  faucet: "Testnet faucet",
};

/**
 * /dashboard/focat — buy anchor packs from the dashboard (chain picker,
 * any recipient wallet) and review past orders. Most users never need
 * this: credits anchoring holds no FOCAT, and validators earn the token
 * from verification tips. The pay-as-you-go upload flow offers the same
 * modal locked to the active chain.
 */
export default async function FocatPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/dashboard/focat");
  const orders = await listFocatOrders(session.user.id);

  return (
    <div className="space-y-8">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
              FOCAT anchor packs
            </p>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Fixed-price top-ups for wallets exercising the propose/verify
              layer — a testnet preview of the roadmap verification market,
              not part of v1. Enough FOCAT for the tip and the refundable
              bond, paid from your USD credits and delivered to a wallet you
              choose. Credits anchoring never needs this. Testnets drip for
              free.
            </p>
          </div>
          <GetFocatButton />
        </div>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">
          Orders
        </h2>
        {orders.length === 0 ? (
          <EmptyState
            icon={<FiZap size={20} />}
            title="No FOCAT orders yet"
            description="Buy an anchor pack here or from the upload flow when paying as you go on a propose/verify chain."
          />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Pack</th>
                  <th className="px-4 py-3 font-medium">Chain</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Paid</th>
                  <th className="px-4 py-3 font-medium">Recipient</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">{PACK_LABELS[order.pack] ?? order.pack}</td>
                    <td className="px-4 py-3">
                      {getChain(order.chainId)?.name ?? order.chainId}
                    </td>
                    <td className="px-4 py-3">{formatFocat(order.focatAmount)}</td>
                    <td className="px-4 py-3">
                      {order.priceMicroUsdc === 0n ? "Free" : formatMicroUsdc(order.priceMicroUsdc)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {order.walletAddress.slice(0, 8)}…{order.walletAddress.slice(-6)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={order.status === "sent" ? "success" : "danger"} size="sm">
                        {order.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <FormattedDate date={order.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
