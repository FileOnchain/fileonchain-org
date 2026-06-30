"use client";

import * as React from "react";
import Link from "next/link";
import FileUploader from "@/components/FileUploaderClient";
import Hero from "@/components/Hero";
import BackgroundMesh from "@/components/BackgroundMesh";
import ChainTicker from "@/components/ChainTicker";
import HowItWorks from "@/components/HowItWorks";
import FeatureTrio from "@/components/FeatureTrio";
import ChainsGrid from "@/components/ChainsGrid";
import CacheExplainer from "@/components/CacheExplainer";
import FaqAccordion from "@/components/FaqAccordion";
import ScrollReveal from "@/components/ScrollReveal";
import OnboardingOverlay from "@/components/onboarding/OnboardingOverlay";
import { useChain } from "@/hooks/useChain";

export default function Home() {
  const { activeChain } = useChain();

  return (
    <main className="relative flex flex-col items-center">
      {/* Background layer — full-bleed ambient gradient + grid. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[1080px]">
        <BackgroundMesh />
      </div>

      <div className="flex w-full max-w-6xl flex-col items-stretch gap-16 px-4 pb-20 pt-12 md:gap-20 md:px-6 md:pb-28 md:pt-20">
        {/* 1 · HERO ------------------------------------------------- */}
        <Hero
          activeChain={{
            id: activeChain.id,
            name: activeChain.name,
            shortName: activeChain.shortName,
          }}
        />

        <ChainTicker />

        {/* 2 · UPLOADER --------------------------------------------- */}
        <div id="dropzone" className="scroll-mt-24">
          <FileUploader />
        </div>

        {/* 3 · HOW IT WORKS ----------------------------------------- */}
        <HowItWorks />

        {/* 4 · FEATURES / GUARANTEES -------------------------------- */}
        <FeatureTrio />

        {/* 5 · ALL 10 CHAINS ---------------------------------------- */}
        <ChainsGrid />

        {/* 6 · PAID CACHE -------------------------------------------- */}
        <CacheExplainer />

        {/* 7 · FAQ --------------------------------------------------- */}
        <FaqAccordion />

        {/* 8 · Closing editorial block -------------------------------- */}
        <ScrollReveal as="section" className="mt-4 w-full">
          <div className="rounded-2xl border border-border bg-surface p-6 md:p-8">
            <div className="grid items-start gap-6 md:grid-cols-[2fr_1fr]">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
                  Open infrastructure
                </p>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                  Pick one chain. Or pay for more.
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
                  Anchoring writes one transaction per chunk on the chain you pick. That chain
                  alone is enough to retrieve the file. If you want redundancy you can add
                  the same file on more chains — each chain charges its own gas, so the price
                  stacks. Use the explorer to see what&apos;s already public before paying for an
                  extra anchor.
                </p>
              </div>
              <div className="flex flex-col items-stretch justify-center gap-2 md:items-end">
                <Link
                  href="/explorer"
                  className="group inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-surface-elevated px-4 text-sm font-medium text-foreground transition-all duration-base ease-out-soft hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Open the explorer
                  <span
                    aria-hidden
                    className="transition-transform duration-base group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </Link>
                <Link
                  href="/donations"
                  className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Fund public cache →
                </Link>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>

      <OnboardingOverlay />
    </main>
  );
}
