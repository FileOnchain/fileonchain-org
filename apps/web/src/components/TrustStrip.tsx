import * as React from "react";
import Link from "next/link";
import { FiCode, FiCpu, FiHash, FiUserX } from "react-icons/fi";
import { siteConfig } from "@/lib/site";

/**
 * TrustStrip, the row of four facts directly under the hero. Each one is
 * something a visitor can check for themselves rather than a claim about
 * adoption: the code is public under MIT, the verifier runs on their
 * machine, only the hash leaves it by default, and verifying needs no
 * account. Adoption signals (stars, downloads) live in the footer and are
 * fetched, never asserted. Server-safe: plain links, no motion.
 */
const ITEMS = [
  {
    Icon: FiCode,
    label: "Open source, MIT",
    detail: "Protocol, verifier, SDKs, and this site",
    href: siteConfig.repo,
    external: true,
  },
  {
    Icon: FiCpu,
    label: "Verifier runs locally",
    detail: "In your browser or the CLI, no call home",
    href: "/verify",
    external: false,
  },
  {
    Icon: FiHash,
    label: "Hash-only by default",
    detail: "Bytes stay with you unless you opt in",
    href: "/protocol",
    external: false,
  },
  {
    Icon: FiUserX,
    label: "No account to verify",
    detail: "An envelope is a file anyone can check",
    href: "/verify",
    external: false,
  },
] as const;

const TrustStrip = () => (
  <section aria-label="What you can check yourself" className="w-full">
    <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border/60 md:grid-cols-4">
      {ITEMS.map(({ Icon, label, detail, href, external }) => {
        const body = (
          <>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon size={15} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold text-foreground">{label}</span>
              <span className="text-xs leading-snug text-muted">{detail}</span>
            </span>
          </>
        );
        const className =
          "flex h-full items-center gap-3 bg-surface px-4 py-3 transition-colors duration-base hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary";
        return (
          <li key={label} className="min-w-0">
            {external ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
                {body}
              </a>
            ) : (
              <Link href={href} className={className}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  </section>
);

export default TrustStrip;
