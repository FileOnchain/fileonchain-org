"use client";

import * as React from "react";
import Link from "next/link";
import { FiArrowRight } from "react-icons/fi";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import CopyButton from "@/components/ui/CopyButton";
import ScrollReveal from "@/components/ScrollReveal";
import type { QuickstartTab, QuickstartTabId } from "@/lib/snippets/types";

interface DeveloperQuickstartProps {
  /** Server-highlighted tabs from `getDeveloperQuickstartTabs()`. */
  tabs: QuickstartTab[];
}

/**
 * One line of context under each snippet. The MCP note carries the
 * required label: the server is a Cloud + SDK integration, not part of the
 * protocol. Kept here rather than in the data module so the notes can link.
 */
const TAB_NOTES: Record<QuickstartTabId, React.ReactNode> = {
  sdk: (
    <>
      <code className="font-mono text-xs text-foreground">createEvidence</code> seals any file
      the same way, without the agent claims. Only digests enter the envelope; storing bytes
      onchain is an explicit opt-in. Reference SDK on{" "}
      <Link href="/docs#umbrella" className="text-primary underline underline-offset-2">
        the docs page
      </Link>
      .
    </>
  ),
  cli: (
    <>
      The same deterministic verifier the{" "}
      <Link href="/verify" className="text-primary underline underline-offset-2">
        /verify page
      </Link>{" "}
      runs in the browser. Artifact and envelope signatures are reported separately; the result
      word is the verifier&apos;s status, never a bare &ldquo;verified&rdquo;.
    </>
  ),
  mcp: (
    <>
      <span className="font-medium text-foreground">Cloud + SDK integration, not part of the protocol.</span>{" "}
      <code className="font-mono text-xs text-foreground">verify_evidence</code> runs the local
      verifier in-process; the anchoring tools spend account credits through FileOnChain Cloud.
      Details on{" "}
      <Link href="/docs#mcp" className="text-primary underline underline-offset-2">
        the docs page
      </Link>
      .
    </>
  ),
};

const AUDIENCE_LINKS = [
  {
    question: "Sealing a release?",
    answer: "GitHub Action starter and status badge",
    href: "/docs#share",
  },
  {
    question: "Auditing an agent?",
    answer: "Agent Evidence Profile: runs, tool calls, approvals",
    href: "/agent-evidence",
  },
  {
    question: "Just want a file onchain?",
    answer: "Upload from the browser, no code",
    href: "#dropzone",
  },
] as const;

/**
 * DeveloperQuickstart, the code block directly under the hero. Three tabs
 * (SDK, CLI, MCP) with a copy button each, then one line per audience.
 * Snippets arrive pre-highlighted from the server: the SDK tab is read from
 * a file `next build` type-checks, so what the homepage shows compiles
 * against the current SDK.
 */
const DeveloperQuickstart = ({ tabs }: DeveloperQuickstartProps) => {
  const [active, setActive] = React.useState<string>(tabs[0]?.id ?? "sdk");
  if (tabs.length === 0) return null;
  return (
    <ScrollReveal as="section" aria-labelledby="quickstart-heading" className="w-full">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
            For developers
          </p>
          <h2
            id="quickstart-heading"
            className="mt-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl"
          >
            The whole loop in a few lines
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
            Seal with the reference SDK, verify with the CLI, or hand the tools to the agent you
            already use. Every path produces and checks the same portable envelope.
          </p>
        </div>
      </div>

      <Tabs value={active} onValueChange={setActive} className="mt-6">
        <TabsList aria-label="Quickstart snippets">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-3">
            <figure className="overflow-hidden rounded-lg border border-border bg-surface">
              <figcaption className="flex items-center justify-between gap-2 border-b border-border bg-surface-elevated/60 px-3 py-1.5">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {tab.title}
                </span>
                <CopyButton
                  value={tab.code}
                  label="Copy"
                  ariaLabel={`Copy the ${tab.label} snippet`}
                />
              </figcaption>
              {/* Shiki output rendered on the server from our own string
                  constants: a <pre><code> tree of colored spans. */}
              <div dangerouslySetInnerHTML={{ __html: tab.html }} />
            </figure>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
              {TAB_NOTES[tab.id]}
            </p>
          </TabsContent>
        ))}
      </Tabs>

      <ul className="mt-6 grid gap-2 sm:grid-cols-3">
        {AUDIENCE_LINKS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="group flex h-full flex-col gap-1 rounded-lg border border-border bg-surface px-4 py-3 transition-colors duration-base hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                {item.question}
                <FiArrowRight
                  size={14}
                  aria-hidden
                  className="transition-transform duration-base group-hover:translate-x-0.5"
                />
              </span>
              <span className="text-xs text-muted">{item.answer}</span>
            </Link>
          </li>
        ))}
      </ul>
    </ScrollReveal>
  );
};

export default DeveloperQuickstart;
