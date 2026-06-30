"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { FaGithub, FaHeart, FaLinkedin, FaTwitter } from "react-icons/fa";
import { CHAINS } from "@/lib/chains/registry";

const GITHUB_REPO = "https://github.com/FileOnchain/fileonchain-web";
const AUTHOR_LINKS = [
  { href: "https://github.com/marc-aurele-besner", label: "GitHub", Icon: FaGithub },
  {
    href: "https://www.linkedin.com/in/marc-aurele-besner/",
    label: "LinkedIn",
    Icon: FaLinkedin,
  },
  { href: "https://x.com/marcaureleb", label: "Twitter", Icon: FaTwitter },
];

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * Footer — bottom of the layout chrome. Lives in `layout.tsx` (not page) so
 * it persists across routes. Reserves flow space (no `fixed bottom-0`) so it
 * never overlaps content.
 *
 * SSR-fallback friendly: the wrapper is fully visible in static HTML so even
 * if framer-motion chunks fail to hydrate, the footer is still rendered. The
 * `initial` state only animates when hydration succeeds.
 */
const Footer = () => (
  <footer className="mt-16 border-t border-border bg-surface/40">
    <motion.div
      initial={false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      style={{ opacity: 1 }}
      className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 md:px-6"
    >
      {/* Top row — editorial wordmark + chain count */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold tracking-tight text-foreground">
          FileOnChain
        </p>
        <p className="font-mono text-[11px] text-muted">
          {CHAINS.length} chains · anchored forever
        </p>
      </div>

      {/* Hairline */}
      <div className="hairline" />

      {/* Bottom row — author / repo */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted md:justify-between">
        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:rounded"
        >
          <FaGithub size={16} />
          <span>GitHub Repo</span>
        </a>
        <p className="inline-flex items-center gap-1.5">
          Made with{" "}
          <motion.span
            initial={false}
            animate={{ scale: [1, 1.18, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.4 }}
            className="inline-flex text-danger"
          >
            <FaHeart />
          </motion.span>{" "}
          by Marc-Aurèle
        </p>
        <div className="inline-flex items-center gap-3">
          {AUTHOR_LINKS.map(({ href, label, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="text-muted transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:rounded"
            >
              <Icon size={18} />
            </a>
          ))}
        </div>
      </div>
    </motion.div>
  </footer>
);

export default Footer;
