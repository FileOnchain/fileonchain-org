import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  inlineToHtml,
  parseChangelog,
  releaseToHtml,
  tokenizeInline,
} from "@/lib/changelog/parse";

const REPO = "https://github.com/FileOnchain/fileonchain-org";

const SAMPLE = `# Changelog

Preamble that must be ignored.

- a preamble bullet that must also be ignored

## Unreleased

### Webapp

- Pending item (#1)

## 0.2.0 - 2026-10-01

Release note line.

### Protocol

- Merkle domain separation changes canonical bytes; fixtures in
  \`packages/protocol/fixtures/\` regenerated (#12)
- See [the spec](https://example.com/spec)

## 2026-09-09

- A bullet without an area heading
`;

describe("parseChangelog", () => {
  const { releases } = parseChangelog(SAMPLE);

  it("skips the preamble and reads each release heading form", () => {
    expect(releases.map((r) => r.title)).toEqual(["Unreleased", "0.2.0", "2026-09-09"]);
    expect(releases[0]).toMatchObject({ unreleased: true, date: null, slug: "unreleased" });
    expect(releases[1]).toMatchObject({ unreleased: false, date: "2026-10-01", slug: "0-2-0" });
    expect(releases[2]).toMatchObject({ unreleased: false, date: "2026-09-09", slug: "2026-09-09" });
  });

  it("keeps notes, folds continuation lines, and defaults the area", () => {
    expect(releases[1].notes).toEqual(["Release note line."]);
    expect(releases[1].sections[0].title).toBe("Protocol");
    expect(releases[1].sections[0].items[0]).toBe(
      "Merkle domain separation changes canonical bytes; fixtures in `packages/protocol/fixtures/` regenerated (#12)",
    );
    expect(releases[2].sections).toEqual([
      { title: "Changes", items: ["A bullet without an area heading"] },
    ]);
  });
});

describe("inline markdown", () => {
  it("tokenises code, links, and pull-request references", () => {
    expect(tokenizeInline("Fix `a` in [b](https://x.y) (#7)", REPO)).toEqual([
      { kind: "text", value: "Fix " },
      { kind: "code", value: "a" },
      { kind: "text", value: " in " },
      { kind: "link", value: "b", href: "https://x.y" },
      { kind: "text", value: " (" },
      { kind: "link", value: "#7", href: `${REPO}/pull/7` },
      { kind: "text", value: ")" },
    ]);
  });

  it("leaves #refs as text without a repo and never links a fragment", () => {
    expect(tokenizeInline("see #7", undefined)).toEqual([{ kind: "text", value: "see #7" }]);
    expect(tokenizeInline("https://a.b/#1", REPO)).toEqual([{ kind: "text", value: "https://a.b/#1" }]);
  });

  it("escapes HTML in feed bodies", () => {
    expect(inlineToHtml("<b> & `x<y`", REPO)).toBe("&lt;b&gt; &amp; <code>x&lt;y</code>");
    const html = releaseToHtml(parseChangelog(SAMPLE).releases[1], REPO);
    expect(html).toContain("<p>Release note line.</p>");
    expect(html).toContain("<h3>Protocol</h3><ul><li>");
    expect(html).toContain(`<a href="${REPO}/pull/12">#12</a>`);
  });
});

describe("repository CHANGELOG.md", () => {
  const markdown = readFileSync(path.resolve(__dirname, "../../../CHANGELOG.md"), "utf8");
  const { releases } = parseChangelog(markdown);

  it("parses into releases that all carry at least one entry", () => {
    expect(releases.length).toBeGreaterThan(1);
    for (const release of releases) {
      expect(release.sections.length, release.title).toBeGreaterThan(0);
      for (const section of release.sections) expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it("dates every release except Unreleased, newest first", () => {
    const dated = releases.filter((r) => !r.unreleased).map((r) => r.date);
    expect(dated.every((d) => d !== null)).toBe(true);
    expect(dated).toEqual([...dated].sort().reverse());
    expect(new Set(releases.map((r) => r.slug)).size).toBe(releases.length);
  });
});
