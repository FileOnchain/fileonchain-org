"use client";

import * as React from "react";
import { motion } from "motion/react";
import { FiArrowRight } from "react-icons/fi";
import ChunkFlowVisual from "@/components/ChunkFlowVisual";
import MagneticButton from "@/components/MagneticButton";
import WordReveal from "@/components/WordReveal";
import LiveLedgerTicker, {
  StatCounter,
  type LedgerTickerEvent,
} from "@/components/LiveLedgerTicker";
import Link from "next/link";
import { ACTIVE_CHAINS } from "@fileonchain/sdk";
import { formatRelativeTime } from "@/lib/cid/format";

interface HeroProps {
  /** Number of chains supported, used in the kicker line. */
  chainCount?: number;
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * Recent-anchor feed for the hero ticker — the same DB-backed indexer
 * rows the explorer renders, fetched through `/api/indexer/recent`
 * because the homepage is a Client Component. Until rows arrive (or
 * when the indexer has none) the ticker renders nothing — the hero
 * never shows fabricated CIDs.
 */
const useRecentAnchorEvents = (): LedgerTickerEvent[] => {
  const [events, setEvents] = React.useState<LedgerTickerEvent[]>([]);
  React.useEffect(() => {
    const controller = new AbortController();
    fetch("/api/indexer/recent", { signal: controller.signal })
      .then((res) =>
        res.ok ? (res.json() as Promise<{ events?: RecentAnchorEvent[] }>) : { events: [] },
      )
      .then((data) => {
        const now = Date.now();
        setEvents(
          (data.events ?? []).map((e) => ({
            cid: e.cid,
            chain: e.chain,
            time: formatRelativeTime(e.anchoredAt, now),
          })),
        );
      })
      .catch(() => {
        // Fail open — an unreachable indexer just means no ticker.
      });
    return () => controller.abort();
  }, []);
  return events;
};

interface RecentAnchorEvent {
  cid: string;
  chain: string;
  /** Unix timestamp in seconds. */
  anchoredAt: number;
}

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
  // "Networks live" means open for anchoring — roadmap adapters don't count.
  chainCount = ACTIVE_CHAINS.length,
}: HeroProps) => {
  const tickerEvents = useRecentAnchorEvents();
  return (
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
            text={`Put any file onchain.\nProve any agent run.`}
            className="text-balance whitespace-pre-line text-[44px] font-bold leading-[0.98] tracking-tight md:text-6xl lg:text-[72px] text-foreground"
          />

          {/* Subhead */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9, ease: EASE_OUT }}
            className="max-w-xl text-pretty text-base leading-relaxed text-muted md:text-lg"
          >
            Drop a document, a dataset, a release — or a full{" "}
            <Link
              href="/agent-evidence"
              className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              AI-agent run
            </Link>{" "}
            — and seal it into a{" "}
            <span className="font-semibold text-foreground">portable evidence package</span>{" "}
            anyone can independently verify. Store the bytes onchain if you want
            to; by default only the hash leaves your machine.
          </motion.p>

          {/* CTAs — magnetic primary + ghost outline */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.0, ease: EASE_OUT }}
            className="mt-1 flex flex-wrap items-center gap-3"
          >
            <MagneticButton href="#dropzone" rightIcon={<FiArrowRight size={16} />}>
              Upload a file
            </MagneticButton>
            <Link
              href="/verify"
              className="group inline-flex h-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium text-foreground transition-all hover:gap-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Verify a package
              <span
                aria-hidden
                className="transition-transform duration-base group-hover:translate-x-0.5"
              >
                ›
              </span>
            </Link>
          </motion.div>

          {/* Live ledger ticker — real indexed anchors only; hidden while
              the feed loads or when the indexer has no rows. */}
          {tickerEvents.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE_OUT }}
              className="w-full max-w-xl"
            >
              <LiveLedgerTicker events={tickerEvents} />
            </motion.div>
          )}

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
              label="Networks live"
              hint="Autonomys · Solana · EVM testnets"
            />
            <StatCounter
              value={1}
              label="Open protocol"
              hint="Independently implementable"
            />
            <StatCounter
              value={3}
              label="Storage modes"
              hint="Hash-only by default"
            />
          </motion.div>

        </motion.div>

        {/* Visual column ---------------------------------------------------- */}
        <motion.div
          initial={{ opacity: 0, y: 16, rotateX: 6 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.75, delay: 0.25, ease: EASE_OUT }}
          className="relative perspective-[1400px]"
        >
          <div className="transition-transform duration-slow ease-out-soft will-change-transform hover:transform-[rotateX(2deg)_rotateY(-2deg)]">
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
};

export default Hero;
