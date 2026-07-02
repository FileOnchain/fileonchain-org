"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiChevronDown } from "react-icons/fi";
import ScrollReveal from "@/components/ScrollReveal";
import { FAQ } from "@/lib/faq";

/**
 * FaqAccordion — minimal accessible FAQ list. Each row is a button that
 * toggles its panel open/closed with a framer-motion height + opacity
 * transition. Only one panel can be open at a time (radio behaviour) —
 * readers expect that for FAQs and it removes visual noise.
 *
 * Also emits `FAQPage` JSON-LD (from the same `FAQ` data) so Google can
 * surface these as FAQ rich results. Client Components still server-render
 * their initial markup, so the script lands in the SSR HTML crawlers read.
 */

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const FaqAccordion = () => {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  return (
    <ScrollReveal as="section" stagger amount={0.15} className="w-full">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
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
