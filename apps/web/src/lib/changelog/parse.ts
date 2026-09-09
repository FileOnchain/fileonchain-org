/**
 * Parser for the repository `CHANGELOG.md`. Pure and isomorphic so the
 * `/changelog` page, the RSS route, and the unit tests share one reading
 * of the file. The accepted grammar is deliberately small (the file's
 * own preamble documents it):
 *
 *   ## <title>                 opens a release; `## Unreleased` is the
 *                              pending section, `## 2026-09-09` a dated
 *                              release with no tag, `## 0.2.0 - 2026-10-01`
 *                              a tagged one
 *   ### <area>                 groups entries inside a release
 *   - <entry>                  one change; indented continuation lines
 *                              fold into the entry
 *
 * Anything before the first `## ` heading is the preamble and is ignored.
 * Paragraph lines directly under a release heading are kept as notes.
 */

export interface ChangelogSection {
  /** Area heading, e.g. "Protocol", "Webapp". */
  title: string;
  /** Raw inline-markdown entries, one per bullet. */
  items: string[];
}

export interface ChangelogRelease {
  /** Heading text without the date suffix, e.g. "0.2.0" or "2026-09-09". */
  title: string;
  /** ISO date (`YYYY-MM-DD`) when the heading carries one, else null. */
  date: string | null;
  /** True for the `## Unreleased` section. */
  unreleased: boolean;
  /** URL-safe anchor derived from the title, e.g. "0-2-0". */
  slug: string;
  /** Paragraph lines directly under the release heading. */
  notes: string[];
  sections: ChangelogSection[];
}

export interface Changelog {
  releases: ChangelogRelease[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const slugifyReleaseTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** `"0.2.0 - 2026-10-01"` -> title + date; `"2026-09-09"` is its own date. */
const parseReleaseHeading = (heading: string): Pick<ChangelogRelease, "title" | "date" | "unreleased"> => {
  const text = heading.trim();
  if (/^unreleased$/i.test(text)) return { title: "Unreleased", date: null, unreleased: true };
  const dated = /^(.+?)\s+[-–—]\s+(\d{4}-\d{2}-\d{2})$/.exec(text);
  if (dated) return { title: dated[1].trim(), date: dated[2], unreleased: false };
  if (ISO_DATE.test(text)) return { title: text, date: text, unreleased: false };
  return { title: text, date: null, unreleased: false };
};

export const parseChangelog = (markdown: string): Changelog => {
  const releases: ChangelogRelease[] = [];
  let release: ChangelogRelease | null = null;
  let section: ChangelogSection | null = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");

    if (line.startsWith("## ")) {
      release = { ...parseReleaseHeading(line.slice(3)), slug: "", notes: [], sections: [] };
      release.slug = slugifyReleaseTitle(release.title);
      releases.push(release);
      section = null;
      continue;
    }
    if (!release) continue; // preamble

    if (line.startsWith("### ")) {
      section = { title: line.slice(4).trim(), items: [] };
      release.sections.push(section);
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!section) {
        section = { title: "Changes", items: [] };
        release.sections.push(section);
      }
      section.items.push(bullet[1].trim());
      continue;
    }

    const continuation = /^\s{2,}(\S.*)$/.exec(line);
    if (continuation && section && section.items.length > 0) {
      const last = section.items.length - 1;
      section.items[last] = `${section.items[last]} ${continuation[1].trim()}`;
      continue;
    }

    if (line.trim() === "") continue;
    if (!section) release.notes.push(line.trim());
  }

  return { releases };
};

/* ------------------------------------------------------------------ */
/* Inline markdown                                                     */
/* ------------------------------------------------------------------ */

export type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; value: string; href: string };

/**
 * Tokenises the subset of inline markdown the changelog uses: `code`,
 * `[text](url)`, and bare `#123` pull-request references, which resolve
 * against `repoUrl` when one is given. Everything else is plain text.
 */
export const tokenizeInline = (text: string, repoUrl?: string): InlineToken[] => {
  const tokens: InlineToken[] = [];
  // Adjacent text runs fold into one token so an unlinked `#123` never
  // splits the surrounding sentence.
  const pushText = (value: string) => {
    if (!value) return;
    const last = tokens[tokens.length - 1];
    if (last?.kind === "text") last.value += value;
    else tokens.push({ kind: "text", value });
  };
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w/])#(\d+)\b/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    pushText(text.slice(cursor, start));
    if (match[1] !== undefined) {
      tokens.push({ kind: "code", value: match[1] });
    } else if (match[2] !== undefined && match[3] !== undefined) {
      tokens.push({ kind: "link", value: match[2], href: match[3] });
    } else if (match[4] !== undefined) {
      if (repoUrl) {
        tokens.push({ kind: "link", value: `#${match[4]}`, href: `${repoUrl}/pull/${match[4]}` });
      } else {
        pushText(`#${match[4]}`);
      }
    }
    cursor = start + match[0].length;
  }
  pushText(text.slice(cursor));
  return tokens;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Inline markdown to escaped HTML, for the RSS feed's item bodies. */
export const inlineToHtml = (text: string, repoUrl?: string): string =>
  tokenizeInline(text, repoUrl)
    .map((token) => {
      switch (token.kind) {
        case "code":
          return `<code>${escapeHtml(token.value)}</code>`;
        case "link":
          return `<a href="${escapeHtml(token.href)}">${escapeHtml(token.value)}</a>`;
        default:
          return escapeHtml(token.value);
      }
    })
    .join("");

/** A whole release as escaped HTML, for the RSS feed. */
export const releaseToHtml = (release: ChangelogRelease, repoUrl?: string): string => {
  const notes = release.notes.map((note) => `<p>${inlineToHtml(note, repoUrl)}</p>`);
  const sections = release.sections.map(
    (section) =>
      `<h3>${escapeHtml(section.title)}</h3><ul>${section.items
        .map((item) => `<li>${inlineToHtml(item, repoUrl)}</li>`)
        .join("")}</ul>`,
  );
  return [...notes, ...sections].join("");
};
