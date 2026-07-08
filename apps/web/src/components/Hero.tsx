"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { FiArrowRight } from "react-icons/fi";
import ChunkFlowVisual from "@/components/ChunkFlowVisual";
import ChainBadge from "@/components/ui/ChainBadge";
import MagneticButton from "@/components/MagneticButton";
import WordReveal from "@/components/WordReveal";
import LiveLedgerTicker, { StatCounter, compactNumber } from "@/components/LiveLedgerTicker";
import Link from "next/link";
import { ACTIVE_CHAINS } from "@fileonchain/sdk";

interface HeroProps {
  activeChain?: {
    id: string;
    name: string;
    shortName: string;
  };
  /** Number of chains supported, used in the kicker line. */
  chainCount?: number;
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * Hero — top-of-page pitch block.
 *
 * Composition:
 *   1. Editorial kicker chip with a live "now anchoring" dot
 *   2. Word-by-word revealed headline (bold sans, no italics, no gradients)
 *   3. Subhead with one emphasized fragment
 *   4. Two magnetic-style CTAs (primary anchor + ghost)
 *   5. Live ledger ticker strip (drifts under the headline)
 *   6. Animated stat row (chains supported, files anchored, % uptime)
 *   7. Right side: animated ChunkFlowVisual SVG
 */
const Hero = ({
  activeChain,
  // "Chains live" means open for anchoring — planned entries don't count.
  chainCount = ACTIVE_CHAINS.filter((c) => !c.testnet).length,
}: HeroProps) => (
  <section className="relative w-full">
    <div className="grid w-full items-center gap-10 md:gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Text column ----------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-start gap-6"
      >
        {/* Kicker */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted backdrop-blur"
        >
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success">
            <span className="absolute inset-0 animate-orbit-pulse rounded-full bg-success" />
          </span>
          <span>VOL. 01 · ONCHAIN LEDGER</span>
        </motion.div>

        {/* Headline — word-by-word reveal, no italic, no gradient */}
        <WordReveal
          as="h1"
          text={`Upload files permanently.\nPin them onchain.`}
          className="text-balance whitespace-pre-line text-[44px] font-bold leading-[0.98] tracking-tight md:text-6xl lg:text-[72px] text-foreground"
        />

        {/* Subhead */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.9, ease: EASE_OUT }}
          className="max-w-xl text-pretty text-base leading-relaxed text-muted md:text-lg"
        >
          Pick a chain, drop a file. We split it into 64&nbsp;KB chunks, send each chunk
          as a separate transaction, and write the tx-hash <span className="font-semibold text-foreground">into
          the registry contract</span> under each chunk&apos;s CID. The platform takes a
          small fee at contract level — that&apos;s it. The cost depends on the chain&apos;s gas.
        </motion.p>

        {/* CTAs — magnetic primary + ghost outline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.0, ease: EASE_OUT }}
          className="mt-1 flex flex-wrap items-center gap-3"
        >
          <MagneticButton href="#dropzone" rightIcon={<FiArrowRight size={16} />}>
            Drop a file
          </MagneticButton>
          <Link
            href="/explorer"
            className="group inline-flex h-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium text-foreground transition-all hover:gap-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Open the explorer
            <span
              aria-hidden
              className="transition-transform duration-base group-hover:translate-x-0.5"
            >
              ›
            </span>
          </Link>
        </motion.div>

        {/* Live ledger ticker */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 1.15, ease: EASE_OUT }}
          className="w-full max-w-xl"
        >
          <LiveLedgerTicker />
        </motion.div>

        {/* Animated stat counter row — each value compact-formatted so wide */}
        {/* numbers never collide with neighbours. */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, delay: 1.25, ease: EASE_OUT }}
          className="mt-2 grid w-full max-w-xl grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8"
        >
          <StatCounter
            value={chainCount}
            label="Chains live"
            hint="Ethereum · Base · Auto EVM"
          />
          <StatCounter
            value={4821043}
            format={compactNumber}
            label="Files anchored"
            hint="Across every runtime"
          />
          <StatCounter
            value={99}
            suffix=".9%"
            label="Uptime · 30d"
            hint="Anchor pipeline"
          />
        </motion.div>

        {/* Active chain indicator */}
        {activeChain && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.4, ease: EASE_OUT }}
            className="mt-1 flex items-center gap-2 text-xs text-muted"
          >
            <span className="uppercase tracking-wider">Anchoring on</span>
            <ChainBadge
              chainId={activeChain.id}
              chainName={activeChain.name}
              shortName={activeChain.shortName}
              size="sm"
            />
          </motion.div>
        )}
      </motion.div>

      {/* Visual column ---------------------------------------------------- */}
      <motion.div
        initial={{ opacity: 0, y: 16, rotateX: 6 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.75, delay: 0.25, ease: EASE_OUT }}
        className="relative [perspective:1400px]"
      >
        <div className="transition-transform duration-slow ease-out-soft will-change-transform hover:[transform:rotateX(2deg)_rotateY(-2deg)]">
          <ChunkFlowVisual />
        </div>
        {/* Backing plate behind the visual */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-2 -z-10 rounded-3xl border border-border bg-surface-elevated/60"
        />
      </motion.div>
    </div>
  </section>
);

export default Hero;
