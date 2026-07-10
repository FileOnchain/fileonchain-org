"use client";

import * as React from "react";
import { formatEther, parseEther } from "viem";
import {
  CHAINS,
  ZERO_ADDRESS,
  validatorStakingAbi,
  fileOnChainAttestationTokenAbi,
  type ChainConfig,
  type ChainId,
} from "@fileonchain/sdk";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import ChainSelect from "@/components/chain/ChainSelect";
import { useEVMWallet } from "@/hooks/useEVMWallet";
import { useWalletStates } from "@/states/wallet";
import { getEvmPublicClient, getEvmWalletClient } from "@/lib/evm/wallet";
import { trackEvent } from "@/lib/analytics";

type StakingChain = ChainConfig & {
  tokenContract: string;
  stakingContract: string;
};

const isStakingProvisioned = (chain: ChainConfig): chain is StakingChain =>
  chain.family === "evm" &&
  !!chain.tokenContract &&
  chain.tokenContract !== ZERO_ADDRESS &&
  !!chain.stakingContract &&
  chain.stakingContract !== ZERO_ADDRESS;

const STAKING_CHAINS = CHAINS.filter(isStakingProvisioned);

interface StakingSnapshot {
  focatBalance: bigint;
  staked: bigint;
  pendingRewards: bigint;
  unbondingAmount: bigint;
  unbondingEndsAt: number;
  minStake: bigint;
  active: boolean;
}

const fmt = (value: bigint) => {
  const eth = Number(formatEther(value));
  return eth.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

/**
 * StakePanel — join the validator set on chains where ValidatorStaking is
 * deployed: stake FOCAT (with the token approval handled inline), start the
 * unbonding cooldown, withdraw unbonded stake, and claim tip rewards.
 * Renders nothing when no chain has the staking contract yet.
 */
const StakePanel = () => {
  const [chainId, setChainId] = React.useState<ChainId | undefined>(STAKING_CHAINS[0]?.id);
  const [amount, setAmount] = React.useState("1000");
  const [snapshot, setSnapshot] = React.useState<StakingSnapshot | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const { toast } = useToast();
  const { connect } = useEVMWallet();
  const evmAddress = useWalletStates((s) => s.evmAddress);

  const chain = STAKING_CHAINS.find((c) => c.id === chainId) ?? STAKING_CHAINS[0];

  React.useEffect(() => {
    if (!chain || !evmAddress) {
      setSnapshot(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const client = await getEvmPublicClient(chain);
        const staking = chain.stakingContract as `0x${string}`;
        const token = chain.tokenContract as `0x${string}`;
        const [focatBalance, info, pendingRewards, minStake, active] = await Promise.all([
          client.readContract({
            address: token,
            abi: fileOnChainAttestationTokenAbi,
            functionName: "balanceOf",
            args: [evmAddress],
          }) as Promise<bigint>,
          client.readContract({
            address: staking,
            abi: validatorStakingAbi,
            functionName: "stakeInfo",
            args: [evmAddress],
          }) as Promise<{
            amount: bigint;
            unbondingAmount: bigint;
            unbondingEndsAt: bigint | number;
          }>,
          client.readContract({
            address: staking,
            abi: validatorStakingAbi,
            functionName: "pendingRewards",
            args: [evmAddress],
          }) as Promise<bigint>,
          client.readContract({
            address: staking,
            abi: validatorStakingAbi,
            functionName: "minStake",
          }) as Promise<bigint>,
          client.readContract({
            address: staking,
            abi: validatorStakingAbi,
            functionName: "isActiveValidator",
            args: [evmAddress],
          }) as Promise<boolean>,
        ]);
        if (cancelled) return;
        setSnapshot({
          focatBalance,
          staked: info.amount,
          pendingRewards,
          unbondingAmount: info.unbondingAmount,
          unbondingEndsAt: Number(info.unbondingEndsAt),
          minStake,
          active,
        });
      } catch {
        if (!cancelled) setSnapshot(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chain, evmAddress, refreshKey]);

  if (!chain) return null;

  const run = async (
    label: string,
    action: () => Promise<`0x${string}`>,
  ) => {
    setBusy(label);
    try {
      const txHash = await action();
      const client = await getEvmPublicClient(chain);
      const receipt = await client.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") throw new Error(`${label} reverted`);
      toast({
        title: `${label} confirmed`,
        description: `Tx ${txHash.slice(0, 10)}… on ${chain.name}`,
        variant: "success",
      });
      trackEvent("validator_staking_action", { action: label, chain_id: chain.id });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: `${label} failed`, description: (e as Error).message, variant: "danger" });
    } finally {
      setBusy(null);
    }
  };

  const handleStake = () =>
    run("Stake", async () => {
      const value = parseEther(amount || "0");
      if (value <= 0n) throw new Error("Enter a FOCAT amount to stake.");
      const { approveToken, stake } = await import("@fileonchain/sdk/evm");
      const [client, { walletClient, address }] = await Promise.all([
        getEvmPublicClient(chain),
        getEvmWalletClient(chain),
      ]);
      const allowance = (await client.readContract({
        address: chain.tokenContract as `0x${string}`,
        abi: fileOnChainAttestationTokenAbi,
        functionName: "allowance",
        args: [address, chain.stakingContract as `0x${string}`],
      })) as bigint;
      if (allowance < value) {
        const approveHash = await approveToken(walletClient, {
          chainId: chain.id,
          spender: chain.stakingContract as `0x${string}`,
          amount: value,
        });
        await client.waitForTransactionReceipt({ hash: approveHash });
      }
      return stake(walletClient, { chainId: chain.id, amount: value });
    });

  const handleUnstake = () =>
    run("Unstake request", async () => {
      const value = parseEther(amount || "0");
      if (value <= 0n) throw new Error("Enter a FOCAT amount to unstake.");
      const { requestUnstake } = await import("@fileonchain/sdk/evm");
      const { walletClient } = await getEvmWalletClient(chain);
      return requestUnstake(walletClient, { chainId: chain.id, amount: value });
    });

  const handleWithdraw = () =>
    run("Withdraw", async () => {
      const { withdrawUnstaked } = await import("@fileonchain/sdk/evm");
      const { walletClient } = await getEvmWalletClient(chain);
      return withdrawUnstaked(walletClient, { chainId: chain.id });
    });

  const handleClaim = () =>
    run("Claim rewards", async () => {
      const { claimRewards } = await import("@fileonchain/sdk/evm");
      const { walletClient } = await getEvmWalletClient(chain);
      return claimRewards(walletClient, { chainId: chain.id });
    });

  const now = Math.floor(Date.now() / 1000);
  const withdrawable =
    !!snapshot && snapshot.unbondingAmount > 0n && snapshot.unbondingEndsAt <= now;

  return (
    <Card className="mt-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Stake FOCAT to validate</h3>
          <p className="mt-0.5 text-xs text-muted">
            Stake at least{" "}
            <span className="font-mono">{snapshot ? fmt(snapshot.minStake) : "1,000"} FOCAT</span>{" "}
            to join the active set — validators split 60% of every verified tip and sit on
            dispute juries.
          </p>
        </div>
        <div className="w-full sm:w-56">
          <ChainSelect
            id="stake-chain"
            chains={STAKING_CHAINS}
            value={chain.id}
            onValueChange={(id) => setChainId(id as ChainId)}
          />
        </div>
      </div>

      {!evmAddress ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-3">
          <p className="text-sm text-muted">Connect an EVM wallet to stake on {chain.name}.</p>
          <Button
            size="sm"
            onClick={() =>
              connect().catch((e: unknown) =>
                toast({ title: "Connect failed", description: (e as Error).message, variant: "danger" }),
              )
            }
          >
            Connect wallet
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StakeStat label="FOCAT balance" value={snapshot ? fmt(snapshot.focatBalance) : "—"} />
            <StakeStat
              label="Staked"
              value={snapshot ? fmt(snapshot.staked) : "—"}
              badge={
                snapshot ? (
                  <Badge variant={snapshot.active ? "success" : "warning"} size="sm">
                    {snapshot.active ? "active" : "inactive"}
                  </Badge>
                ) : undefined
              }
            />
            <StakeStat
              label="Unbonding"
              value={snapshot ? fmt(snapshot.unbondingAmount) : "—"}
              hint={
                snapshot && snapshot.unbondingAmount > 0n
                  ? withdrawable
                    ? "withdrawable now"
                    : `until ${new Date(snapshot.unbondingEndsAt * 1000).toLocaleString()}`
                  : undefined
              }
            />
            <StakeStat label="Pending rewards" value={snapshot ? fmt(snapshot.pendingRewards) : "—"} />
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Input
                label="Amount (FOCAT)"
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                fullWidth
              />
            </div>
            <Button size="sm" onClick={handleStake} disabled={busy !== null}>
              {busy === "Stake" ? "Staking…" : "Stake"}
            </Button>
            <Button size="sm" variant="secondary" onClick={handleUnstake} disabled={busy !== null}>
              {busy === "Unstake request" ? "Requesting…" : "Request unstake"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleWithdraw}
              disabled={busy !== null || !withdrawable}
            >
              {busy === "Withdraw" ? "Withdrawing…" : "Withdraw unbonded"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleClaim}
              disabled={busy !== null || !snapshot || snapshot.pendingRewards === 0n}
            >
              {busy === "Claim rewards" ? "Claiming…" : "Claim rewards"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
};

interface StakeStatProps {
  label: string;
  value: string;
  hint?: string;
  badge?: React.ReactNode;
}

const StakeStat = ({ label, value, hint, badge }: StakeStatProps) => (
  <div className="rounded-xl border border-border bg-surface-elevated px-3 py-2.5">
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
    <p className="mt-1 flex items-center gap-2 font-mono text-sm font-semibold text-foreground">
      {value}
      {badge}
    </p>
    {hint && <p className="mt-0.5 text-[10px] text-muted">{hint}</p>}
  </div>
);

export default StakePanel;
