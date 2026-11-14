import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BLOG_DIR, loadPosts } from "@/lib/blog/load";
import { splitFrontmatter } from "@/lib/blog/parse";
import { FAQ } from "@/lib/faq";
import { PUBLIC_PAGES, type PublicPageSection } from "@/lib/public-pages";
import { siteConfig } from "@/lib/site";

/**
 * `llms.txt` (https://llmstxt.org) and its long-form companion
 * `llms-full.txt`: a plain Markdown map of the site for answer engines and
 * agents that read text rather than render pages. Both are prerendered at
 * build time from the same sources as the pages (public-page list, blog
 * Markdown, FAQ, and the specs under the repo's `docs/`), so they cannot
 * drift from what the site says.
 */

/** Repo-root docs worth handing to a model in full, in reading order. */
const REPO_ROOT = path.resolve(process.cwd(), "..", "..");
const SPEC_DOCS = [
  { file: "docs/protocol/evidence-protocol.md", title: "FileOnChain Evidence Protocol (specification)" },
  { file: "docs/profiles/agent-evidence-v1.md", title: "Agent Evidence Profile v1 (specification)" },
  { file: "docs/integrations/status.md", title: "Integration status ledger" },
] as const;

const SECTIONS: readonly PublicPageSection[] = [
  "Start here",
  "Specification and docs",
  "Tools",
  "Project",
];

const SUMMARY = [
  "FileOnChain is an open protocol and toolset for portable, independently verifiable evidence.",
  "A file, a software release, or an AI-agent run is sealed into an evidence envelope: a JSON document",
  "binding the subject's SHA-256 digest to signed claims, artifact and envelope signatures, and storage",
  "and settlement receipts from public systems. Anyone can verify an envelope locally with the open-source",
  "verifier (browser page or `fileonchain verify` CLI) without an account, a wallet, or a call to FileOnChain.",
].join(" ");

const NOTES = [
  "- An envelope proves existence, integrity, signing keys, and timing. It does not prove that a claim is true, legally valid, or factually accurate; signed claims are assertions by the signer.",
  "- Artifact signatures (who signed the subject) and envelope signatures (who assembled the envelope) are verified and reported separately.",
  "- Evidence-only is the default: only hashes, signatures, and receipts are published; the bytes stay with their owner. On-chain storage is opt-in.",
  "- Anchoring on several systems yields independent, chain-native receipts. It is not a cross-chain proof.",
  "- There is no token. Anchoring costs each chain's ordinary transaction fee; FileOnChain Cloud is paid with account credits.",
  "- The protocol is application-neutral. AI-agent semantics live only in the Agent Evidence Profile.",
].join("\n");

const absoluteLinks = (markdown: string): string =>
  markdown.replace(/\]\(\/(?!\/)/g, `](${siteConfig.url}/`);

const repoBlob = (file: string): string => `${siteConfig.repo}/blob/main/${file}`;

export async function buildLlmsTxt(): Promise<string> {
  const posts = (await loadPosts()).filter((post) => !post.draft);
  const out: string[] = [`# ${siteConfig.name}`, "", `> ${SUMMARY}`, "", NOTES, ""];

  for (const section of SECTIONS) {
    out.push(`## ${section}`, "");
    for (const page of PUBLIC_PAGES.filter((p) => p.section === section)) {
      out.push(`- [${page.title}](${siteConfig.url}${page.path}): ${page.summary}`);
    }
    if (section === "Specification and docs") {
      for (const doc of SPEC_DOCS) out.push(`- [${doc.title}](${repoBlob(doc.file)})`);
      out.push(`- [Source code, SDKs, verifier, and conformance fixtures](${siteConfig.repo})`);
    }
    out.push("");
  }

  if (posts.length) {
    out.push("## Articles", "");
    for (const post of posts) {
      out.push(`- [${post.title}](${siteConfig.url}/blog/${post.slug}): ${post.description}`);
    }
    out.push("");
  }

  out.push(
    "## Optional",
    "",
    `- [Full text for language models](${siteConfig.url}/llms-full.txt): this summary, the FAQ, the protocol and profile specifications, the integration status ledger, and every article in one Markdown file.`,
    `- [Blog RSS feed](${siteConfig.url}/blog/feed.xml)`,
    `- [Changelog RSS feed](${siteConfig.url}/changelog/feed.xml)`,
    "",
  );
  return out.join("\n");
}

export async function buildLlmsFullTxt(): Promise<string> {
  const posts = (await loadPosts()).filter((post) => !post.draft);
  const out: string[] = [
    `# ${siteConfig.name}: full text`,
    "",
    `> ${SUMMARY}`,
    "",
    `Source: ${siteConfig.url} · Code and specifications: ${siteConfig.repo}`,
    "",
    "## Key facts",
    "",
    NOTES,
    "",
    "## Frequently asked questions",
    "",
  ];
  for (const { q, a } of FAQ) out.push(`### ${q}`, "", a, "");

  for (const doc of SPEC_DOCS) {
    // The route is prerendered and next.config's trace includes name these
    // files, so stop Turbopack from tracing the whole repo for this read.
    const body = await readFile(path.join(/*turbopackIgnore: true*/ REPO_ROOT, doc.file), "utf8");
    out.push("---", "", `<!-- ${doc.title}: ${repoBlob(doc.file)} -->`, "", body.trim(), "");
  }

  for (const post of posts) {
    const source = await readFile(path.join(BLOG_DIR, `${post.slug}.md`), "utf8");
    const { body } = splitFrontmatter(source);
    out.push(
      "---",
      "",
      `# ${post.title}`,
      "",
      `URL: ${siteConfig.url}/blog/${post.slug} · Published ${post.date}${post.updated ? ` · Updated ${post.updated}` : ""} · ${post.author}`,
      "",
      `> ${post.description}`,
      "",
      absoluteLinks(body.trim()),
      "",
    );
  }
  return out.join("\n");
}
