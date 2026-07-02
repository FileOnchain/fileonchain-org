"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FiArrowRight, FiKey, FiLock, FiServer } from "react-icons/fi";
import ScrollReveal from "@/components/ScrollReveal";

/**
 * CacheExplainer — section explaining the paid private-cache layer that
 * sits on top of the onchain anchor. Three step columns (Encrypt · Pay ·
 * Cache) followed by a CTA strip leading to `/cache`.
 */

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const STEPS = [
  {
    Icon: FiKey,
    title: "Encrypt",
    body:
      "AES-GCM with a key derived from your wallet signature. Only you (and whoever you share with) can read the bytes.",
  },
  {
    Icon: FiServer,
    title: "Pay",
    body:
      "Subscribe by the day or month in the chain's native token. The contract holds the escrow; cache nodes watch the events.",
  },
  {
    Icon: FiLock,
    title: "Cache",
    body:
      "Cache nodes pin your CID for the duration you paid. Retrieval is instant — no RPC lag, no synchronous chain reads.",
  },
] as const;

const CacheExplainer = () => (
  <ScrollReveal as="section" stagger amount={0.2} className="w-full">
    <div className="rounded-2xl border border-border bg-surface p-6 md:p-8">
      <div className="grid items-start gap-6 md:grid-cols-[1fr_2fr]">
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
            Paid private cache
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Hot retrieval for CIDs that need to be fast.
          </h2>
          <p className="text-sm leading-relaxed text-muted md:text-base">
            Onchain anchors are permanent but slow to retrieve. For files that need
            low-latency reads — site assets, datasets, game assets — pay a cache node
            to pin the CID encrypted for the duration you need.
          </p>
          <Link
            href="/cache"
            className="group inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            See the cache plans
            <FiArrowRight
              size={14}
              className="transition-transform duration-base group-hover:translate-x-0.5"
            />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STEPS.map(({ Icon, title, body }, i) => (
            <motion.div
              key={title}
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.5, delay: i * 0.08, ease: EASE_OUT },
                },
              }}
              whileHover={{ y: -2 }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
              className="group flex flex-col gap-2 rounded-xl border border-border bg-surface-elevated p-4 transition-colors hover:border-primary/40"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-primary transition-all group-hover:scale-110 group-hover:rotate-[6deg]">
                <Icon size={16} />
              </span>
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <p className="text-xs leading-relaxed text-muted">{body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  </ScrollReveal>
);

export default CacheExplainer;
