import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { FiServer } from "react-icons/fi";
import { getChain } from "@fileonchain/sdk";
import { auth } from "@/lib/auth";
import { db, customRpcEndpoints } from "@/lib/db";
import FormattedDate from "@/components/ui/FormattedDate";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AddRpcEndpointButton,
  RpcEndpointRowActions,
  RpcEndpointsSync,
} from "@/components/dashboard/RpcEndpointActions";
import type { CustomRpcMap } from "@/lib/rpc-endpoints";

export const metadata: Metadata = { title: "RPC Endpoints" };

export default async function RpcEndpointsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=/dashboard/rpc");

  const rows = await db
    .select()
    .from(customRpcEndpoints)
    .where(eq(customRpcEndpoints.userId, session.user.id))
    .orderBy(asc(customRpcEndpoints.chainId));

  const entries = rows
    .map((row) => ({ row, chain: getChain(row.chainId) }))
    .filter((entry) => entry.chain != null);

  const endpointMap: CustomRpcMap = Object.fromEntries(
    entries.map(({ row }) => [row.chainId, row.url]),
  );

  return (
    <div className="space-y-6">
      <RpcEndpointsSync endpoints={endpointMap} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">
          Point FileOnChain at your own RPC node or provider per chain. Your
          endpoint is used wherever we dial the chain directly — browser
          anchoring and server-side uploads. Wallet extensions broadcast
          through their own configured node.
        </p>
        <AddRpcEndpointButton />
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={<FiServer size={20} />}
          title="No custom RPC endpoints"
          description="All chains use the public default endpoints. Add your own node or provider URL to route your traffic through it."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {entries.map(({ row, chain }) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {chain!.name}
                  </span>
                  <code className="truncate font-mono text-xs text-muted">
                    {row.url}
                  </code>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">
                  default: <code className="font-mono">{chain!.rpcUrl}</code>
                  {" · "}updated <FormattedDate date={row.updatedAt} />
                </p>
              </div>
              <RpcEndpointRowActions chainId={row.chainId} url={row.url} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted">
        Hedera and Cardano server-side anchoring use their own transports
        (Hedera network map, Blockfrost) and don&apos;t take a custom RPC.
      </p>
    </div>
  );
}
