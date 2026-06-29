import * as React from "react";
import { ChainBadge } from "@/components/ui/ChainBadge";

interface HeroProps {
  activeChain?: {
    id: string;
    name: string;
    shortName: string;
  };
  /** Number of chains supported, used in the kicker line. */
  chainCount?: number;
}

/**
 * Hero — top-of-page pitch block. Renders the kicker, gradient heading,
 * subtitle, and active chain indicator. Text scales from `text-4xl` mobile to
 * `text-6xl` desktop.
 */
const Hero = ({ activeChain, chainCount = 10 }: HeroProps) => (
  <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 text-center">
    <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.2em] text-muted">
      Onchain storage · multichain · {chainCount} chains
    </p>
    <h1 className="text-balance text-4xl md:text-6xl font-bold leading-tight">
      <span className="text-gradient">Upload files permanently</span>
      <span className="block text-foreground">to any chain.</span>
    </h1>
    <p className="max-w-2xl text-pretty text-base md:text-lg text-muted">
      Split files into chunks, anchor CIDs onchain across EVM, Substrate, Solana, and Aptos,
      search and rebuild anywhere, and fund public cache through donations.
    </p>
    {activeChain && (
      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
        <span>Active chain:</span>
        <ChainBadge chainId={activeChain.id} chainName={activeChain.name} shortName={activeChain.shortName} />
      </div>
    )}
  </div>
);

export default Hero;