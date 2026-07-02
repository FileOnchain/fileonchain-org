"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { FiInbox, FiLock, FiRepeat } from "react-icons/fi";
import ScrollReveal from "@/components/ScrollReveal";

/**
 * FeatureTrio — three callouts stacked side-by-side that explain the
 * platform's three core promises: permanence, verifiability, and
 * multichain. Each card has a hover-lift, an icon that scales+rotates,
 * an animated underline, and a tiny live indicator.
 */

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const FEATURES = [
  {
    Icon: FiLock,
    eyebrow: "Permanence",
    title: "Anchored forever",
    body:
      "Once the registry tx is included in a block, the chunk's CID and its tx hash are as durable as the chain itself. No central pinning service that can disappear overnight.",
    iconBg: "bg-success/10 text-success",
    indicator: "live",
  },
  {
    Icon: FiInbox,
    eyebrow: "Verifiability",
    title: "Content-addressed",
    body:
      "Each chunk's CID is a SHA-256 of its bytes. Retrieval proves you're getting the exact bytes you anchored — bit-for-bit, no surprises.",
    iconBg: "bg-info/10 text-info",
    indicator: "sha-256",
  },
  {
    Icon: FiRepeat,
    eyebrow: "Choice",
    title: "Pick one chain — or several",
    body:
      "Anchor the file to the chain you want. One chain is enough to retrieve. You can repeat the anchor on more chains for redundancy — each chain charges its own gas.",
    iconBg: "bg-primary/10 text-primary",
    indicator: "10 chains",
  },
] as const;

const FeatureTrio = () => (
  <ScrollReveal as="section" stagger amount={0.2} className="w-full">
    <header className="mb-8 max-w-2xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
        What you get
      </p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
        Three guarantees every file inherits.
      </h2>
    </header>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {FEATURES.map(({ Icon, eyebrow, title, body, iconBg, indicator }, i) => (
        <motion.article
          key={title}
          variants={{
            hidden: { opacity: 0, y: 16 },
            show: {
              opacity: 1,
              y: 0,
              transition: { duration: 0.5, delay: i * 0.08, ease: EASE_OUT },
            },
          }}
          whileHover={{ y: -4 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-5 transition-colors duration-base ease-out-soft hover:border-primary/40 hover:bg-surface-elevated hover:shadow-elev-2"
        >
          {/* Top progress bar that draws in on hover */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-slow ease-out-soft group-hover:scale-x-100"
          />

          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              {eyebrow}
            </span>
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-base ease-out-soft group-hover:scale-110 group-hover:rotate-[6deg] ${iconBg}`}
            >
              <Icon size={18} />
            </span>
          </div>
          <h3 className="text-xl font-semibold text-foreground">{title}</h3>
          <p className="text-sm leading-relaxed text-muted">{body}</p>

          {/* Bottom row — live chip + animated underline */}
          <div className="mt-auto flex items-center justify-between pt-2">
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted">
              <span className="h-1.5 w-1.5 animate-orbit-pulse rounded-full bg-success" />
              {indicator}
            </span>
            <span
              aria-hidden
              className="h-px w-0 bg-primary/60 transition-all duration-slow ease-out-soft group-hover:w-12"
            />
          </div>
        </motion.article>
      ))}
    </div>
  </ScrollReveal>
);

export default FeatureTrio;
