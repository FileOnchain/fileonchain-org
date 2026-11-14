import type { MetadataRoute } from "next";

/**
 * The indexable public pages, in reading order. Single source for
 * `sitemap.ts` and `llms.txt`, so the two never drift. Per-user, signed-in,
 * and unbounded per-CID pages are intentionally absent (they are `noindex`
 * or better reached through search).
 *
 * `summary` is written for answer engines: one plain sentence saying what a
 * reader finds on the page. Keep it within what the page actually shows and
 * within each network's `integrationStatus`.
 */

export type PublicPageSection = "Start here" | "Specification and docs" | "Tools" | "Project";

export interface PublicPage {
  path: string;
  title: string;
  summary: string;
  section: PublicPageSection;
  priority: number;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
}

export const PUBLIC_PAGES: readonly PublicPage[] = [
  {
    path: "/",
    title: "Home",
    summary:
      "What FileOnChain is: seal a file, a release, or an AI-agent run into a portable evidence envelope that anyone can verify locally with the open verifier.",
    section: "Start here",
    priority: 1,
    changeFrequency: "weekly",
  },
  {
    path: "/agent-evidence",
    title: "Agent Evidence",
    summary:
      "The Agent Evidence Profile in practice: sealing AI-agent runs, tool calls, approvals, and outputs into tamper-evident evidence without publishing the prompt.",
    section: "Start here",
    priority: 0.9,
    changeFrequency: "weekly",
  },
  {
    path: "/upload-file",
    title: "Upload a file",
    summary:
      "Seal any file in the browser: hash-only evidence by default (bytes never leave your device), with optional on-chain storage or an external copy.",
    section: "Tools",
    priority: 0.9,
    changeFrequency: "weekly",
  },
  {
    path: "/verify",
    title: "Verify",
    summary:
      "Public browser verifier: paste an evidence envelope (and optionally the original bytes) and get a check-by-check report. Runs in your browser; no account, no wallet.",
    section: "Tools",
    priority: 0.8,
    changeFrequency: "monthly",
  },
  {
    path: "/explorer",
    title: "Explorer",
    summary: "Search anchored content identifiers (CIDs) and their anchor records across the live networks.",
    section: "Tools",
    priority: 0.8,
    changeFrequency: "hourly",
  },
  {
    path: "/protocol",
    title: "Protocol",
    summary:
      "The FileOnChain Evidence Protocol explained: the envelope, artifact vs envelope signatures, receipt adapters, application profiles, and what an envelope does and does not prove.",
    section: "Specification and docs",
    priority: 0.7,
    changeFrequency: "weekly",
  },
  {
    path: "/docs",
    title: "SDK Documentation",
    summary:
      "How to anchor CIDs with the @fileonchain packages: the @fileonchain/sdk umbrella, twelve per-family anchor clients, the hosted API client, and the MCP server.",
    section: "Specification and docs",
    priority: 0.7,
    changeFrequency: "weekly",
  },
  {
    path: "/whitepaper",
    title: "Documents",
    summary:
      "Index of the protocol specification, the Agent Evidence Profile, the Cloud overview, the integration status ledger, and the architecture decision records.",
    section: "Specification and docs",
    priority: 0.7,
    changeFrequency: "monthly",
  },
  {
    path: "/integrations",
    title: "Integrations",
    summary:
      "Every supported storage and settlement system with its honest integration status, from designed to production-ready.",
    section: "Specification and docs",
    priority: 0.7,
    changeFrequency: "weekly",
  },
  {
    path: "/cloud",
    title: "FileOnChain Cloud",
    summary:
      "The hosted product built on the open protocol: anchoring, evidence ingestion, agent-run sealing, hosted verification, retention, and search, paid with account credits.",
    section: "Project",
    priority: 0.7,
    changeFrequency: "weekly",
  },
  {
    path: "/cache",
    title: "Private cache",
    summary: "Pay once for an encrypted (AES-GCM) private cache of your onchain files, with tiered pricing per chain.",
    section: "Project",
    priority: 0.7,
    changeFrequency: "weekly",
  },
  {
    path: "/leaderboard",
    title: "Leaderboard",
    summary: "Uploader identities ranked by anchors written, bytes kept onchain, and donations to the public cache.",
    section: "Project",
    priority: 0.7,
    changeFrequency: "daily",
  },
  {
    path: "/donations",
    title: "Donations",
    summary: "Support the public cache: donate to the platform, fund pinning for a specific CID, or back one chain's cache layer.",
    section: "Project",
    priority: 0.6,
    changeFrequency: "weekly",
  },
  {
    path: "/blog",
    title: "Blog",
    summary: "Short technical articles on how evidence envelopes, signatures, digests, and receipts work.",
    section: "Project",
    priority: 0.6,
    changeFrequency: "weekly",
  },
  {
    path: "/changelog",
    title: "Changelog",
    summary: "Release notes for the protocol, the Agent Evidence Profile, the reference implementations, and the webapp.",
    section: "Project",
    priority: 0.6,
    changeFrequency: "weekly",
  },
  {
    path: "/contact",
    title: "Contact",
    summary: "Contact form for the FileOnChain team.",
    section: "Project",
    priority: 0.4,
    changeFrequency: "yearly",
  },
];
