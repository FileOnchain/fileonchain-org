"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiChevronDown } from "react-icons/fi";
import ScrollReveal from "@/components/ScrollReveal";

/**
 * FaqAccordion — minimal accessible FAQ list. Each row is a button that
 * toggles its panel open/closed with a framer-motion height + opacity
 * transition. Only one panel can be open at a time (radio behaviour) —
 * readers expect that for FAQs and it removes visual noise.
 */

const FAQ = [
  {
    q: "What file types can I anchor?",
    a: "Anything that fits in a browser file input — images, video, JSON, text, binaries. We do not parse or restrict content: the registry writes the content hash, not the bytes. Files larger than ~1GB are chunked so they can fit any supported chain's tx payload.",
  },
  {
    q: "Where are the bytes actually stored?",
    a: "Two places: (1) onchain, the root CID is committed in a registry contract call on the chain you choose; (2) optionally, on a paid cache node that pins the encrypted chunks for the duration you pay for. Anyone can rebuild the file from any number of cache nodes — there is no canonical host.",
  },
  {
    q: "Can I switch chains after anchoring?",
    a: "Yes — re-write the same root CID on a different chain. The CIDs are content-addressed and remain valid forever, so any new chain that reads them can verify the same file. The dashboard shows which chains currently anchor a given CID.",
  },
  {
    q: "What does the donation flow do?",
    a: "Donations fund the public cache layer: a free, slow-tier pin that keeps important public files (research data, archives, open-source releases) retrievable for everyone. 100% of donations are routed to cache node operators via the DonationEscrow contract.",
  },
  {
    q: "How does paid private cache differ from free public cache?",
    a: "Paid cache is encrypted with a key only you (and your sharees) hold. The cache node never sees the bytes in plaintext — it just stores ciphertext for the duration you paid. Public cache is unencrypted and free, intended for non-sensitive archives.",
  },
] as const;

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const FaqAccordion = () => {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  return (
    <ScrollReveal as="section" stagger amount={0.15} className="w-full">
      <header className="mb-8 max-w-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
          Frequently asked
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          Everything you might want to know.
        </h2>
      </header>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface-elevated/40">
        {FAQ.map((item, i) => {
          const open = openIndex === i;
          const isLast = i === FAQ.length - 1;
          return (
            <motion.div
              key={item.q}
              variants={{
                hidden: { opacity: 0, y: 8 },
                show: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.4, delay: i * 0.05, ease: EASE_OUT },
                },
              }}
              className={isLast ? "" : "border-b border-border"}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : i)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors duration-base ease-out-soft hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:px-5 md:py-5"
              >
                <span className="text-sm font-semibold text-foreground md:text-base">
                  {item.q}
                </span>
                <motion.span
                  animate={{ rotate: open ? 180 : 0 }}
                  transition={{ duration: 0.22, ease: EASE_OUT }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted"
                >
                  <FiChevronDown size={14} />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    key="panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: EASE_OUT }}
                    className="overflow-hidden"
                  >
                    <p className="px-4 pb-4 pr-12 text-sm leading-relaxed text-muted md:px-5 md:pb-5 md:text-base">
                      {item.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </ScrollReveal>
  );
};

export default FaqAccordion;
