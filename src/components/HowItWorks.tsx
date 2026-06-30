"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FiLink, FiLayers, FiShield, FiSearch, FiArrowRight } from "react-icons/fi";
import ScrollReveal from "@/components/ScrollReveal";

/**
 * HowItWorks — 3-step pipeline below the hero. Doubles as a soft onboarding
 * context block, since it explains the same flow the upload page runs
 * through. Each card uses an icon + a bold sans-serif heading + a body line.
 * No italic, no gradient — just confident typography + motion.
 */

const STEPS = [
  {
    n: "01",
    Icon: FiLayers,
    title: "Split",
    body:
      "We slice your file into 64KB pieces — small enough to fit any chain's tx payload, large enough to keep tx count low.",
  },
  {
    n: "02",
    Icon: FiLink,
    title: "Hash",
    body:
      "Each chunk is SHA-256 hashed into a content identifier and linked to the next. The root CID commits to the entire file, in order.",
  },
  {
    n: "03",
    Icon: FiShield,
    title: "Anchor",
    body:
      "The root CID is written to a registry contract on the chain you choose. Anyone can verify, retrieve, and rebuild the file — forever.",
  },
] as const;

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const HowItWorks = () => (
  <ScrollReveal as="section" stagger amount={0.2} className="w-full">
    <header className="mb-10 flex flex-col items-start gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
          The pipeline
        </p>
        <h2 className="text-balance text-3xl font-bold tracking-tight md:text-4xl text-foreground">
          Three steps from file to forever.
        </h2>
      </div>
      <p className="max-w-sm text-sm text-muted">
        Everything is content-addressed and reproducible — no central pinning service required.
      </p>
    </header>

    <div className="relative grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* Hairline rule connecting the cards on desktop. */}
      <div className="pointer-events-none absolute left-0 right-0 top-9 hidden h-px md:block">
        <div className="hairline" />
      </div>

      {STEPS.map(({ n, Icon, title, body }, i) => (
        <motion.article
          key={n}
          variants={{
            hidden: { opacity: 0, y: 16 },
            show: {
              opacity: 1,
              y: 0,
              transition: { duration: 0.5, delay: i * 0.07, ease: EASE_OUT },
            },
          }}
          whileHover={{ y: -3 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="group relative flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition-colors duration-base ease-out-soft hover:border-primary/40 hover:bg-surface-elevated hover:shadow-elev-2"
        >
          {/* Animated edge bar */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 rounded-t-2xl bg-primary transition-transform duration-slow ease-out-soft group-hover:scale-x-100"
          />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-widest text-muted">STEP {n}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-elevated text-foreground transition-all duration-base group-hover:scale-110 group-hover:border-primary/40 group-hover:text-primary group-hover:rotate-[8deg]">
              <Icon size={16} />
            </span>
          </div>
          <h3 className="text-xl font-semibold text-foreground">{title}</h3>
          <p className="text-sm leading-relaxed text-muted">{body}</p>
          {/* Underline accent that draws on hover */}
          <span
            aria-hidden
            className="mt-auto h-px w-0 bg-primary/60 transition-all duration-slow ease-out-soft group-hover:w-12"
          />
        </motion.article>
      ))}
    </div>

    {/* Subtle call-out strip below the steps. */}
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: { duration: 0.4, delay: 0.25 } },
      }}
      className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-surface/40 px-4 py-3 text-xs text-muted"
    >
      <div className="flex items-center gap-2">
        <FiSearch size={14} className="text-primary" />
        <span>
          Tip — paste any CID into the{" "}
          <Link
            href="/explorer"
            className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            explorer
          </Link>{" "}
          to see which chain anchored it.
        </span>
      </div>
      <Link
        href="/explorer"
        className="inline-flex items-center gap-1 font-mono text-foreground hover:text-primary"
      >
        bafy…zdi
        <FiArrowRight size={12} />
      </Link>
    </motion.div>
  </ScrollReveal>
);

export default HowItWorks;
