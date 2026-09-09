"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { FiArchive, FiCpu, FiPackage } from "react-icons/fi";
import ScrollReveal from "@/components/ScrollReveal";

/**
 * WhoIsItFor, three audience segments with one concrete scenario each.
 * Every scenario stays inside the claims policy: an envelope shows that
 * bytes existed, unchanged, at a time, and which keys signed what. None
 * of the copy says an envelope proves truth, legal validity, or
 * authorship, and no network is described beyond its integration status.
 */

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const SEGMENTS = [
  {
    Icon: FiCpu,
    eyebrow: "Agent builders",
    title: "Seal a run, hand over the proof.",
    scenario:
      "Seal a run's outputs, tool calls, and approvals under the Agent Evidence Profile. Hand the envelope to whoever needs independent evidence that those records existed, unchanged, when the run finished, and which keys signed them.",
    href: "/agent-evidence",
    cta: "Agent Evidence",
    iconBg: "bg-primary/10 text-primary",
  },
  {
    Icon: FiPackage,
    eyebrow: "Release engineers",
    title: "Seal a release and its SBOM.",
    scenario:
      "Hash a release tarball and its SBOM into one manifest and seal it, from the SDK or the starter GitHub Action. Anyone holding the bytes recomputes the hashes and confirms they match, without trusting the registry that served them.",
    href: "/docs",
    cta: "SDK and Action docs",
    iconBg: "bg-info/10 text-info",
  },
  {
    Icon: FiArchive,
    eyebrow: "Archivists and compliance",
    title: "Timestamp a document, keep the bytes.",
    scenario:
      "Timestamp a document or dataset on public settlement systems and keep the file wherever you hold it. Store the bytes onchain only if you choose to; by default only the hash leaves your machine.",
    href: "/upload-file",
    cta: "Upload a file",
    iconBg: "bg-success/10 text-success",
  },
] as const;

const WhoIsItFor = () => (
  <ScrollReveal as="section" stagger amount={0.2} className="w-full" aria-labelledby="who-is-it-for">
    <header className="mb-8 max-w-2xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
        Who is this for
      </p>
      <h2 id="who-is-it-for" className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
        Three people, one evidence envelope.
      </h2>
    </header>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {SEGMENTS.map(({ Icon, eyebrow, title, scenario, href, cta, iconBg }, i) => (
        <motion.article
          key={eyebrow}
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
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-slow ease-out-soft group-hover:scale-x-100"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              {eyebrow}
            </span>
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-base ease-out-soft group-hover:scale-110 group-hover:rotate-6 ${iconBg}`}
            >
              <Icon size={18} />
            </span>
          </div>
          <h3 className="text-xl font-semibold text-foreground">{title}</h3>
          <p className="text-sm leading-relaxed text-muted">{scenario}</p>
          <Link
            href={href}
            className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {cta}
            <span aria-hidden className="transition-transform duration-base group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </motion.article>
      ))}
    </div>

    <p className="mt-4 text-xs leading-relaxed text-muted">
      In every scenario the envelope shows existence, integrity, signing keys, and timing.
      Signed claims are assertions by the signer; an envelope never proves truth, legal
      validity, or authorship.
    </p>
  </ScrollReveal>
);

export default WhoIsItFor;
