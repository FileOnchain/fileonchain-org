import "server-only";
import { siteConfig } from "@/lib/site";

/**
 * Public usage signals for the footer: GitHub stars on the monorepo and
 * weekly npm downloads for the published packages. Served through
 * `/api/social-proof` and cached for an hour in the Next data cache, so
 * at most one upstream call per source per hour.
 *
 * Every signal is optional and fails open to `null`: a rate-limited
 * GitHub API or a package that is not on npm yet simply renders nothing.
 * Nothing here is ever estimated or padded, which is the whole point of
 * showing it.
 */

export interface NpmPackageStat {
  name: string;
  /** Downloads over the last seven days, as reported by the npm registry. */
  weeklyDownloads: number;
}

export interface SocialProof {
  /** Stargazer count, or null when GitHub did not answer. */
  stars: number | null;
  /** Only packages that are actually published and reported a count. */
  npm: NpmPackageStat[];
}

/** Packages whose download counts are worth showing once they are on npm. */
export const SOCIAL_PROOF_PACKAGES = ["@fileonchain/sdk", "@fileonchain/verify"] as const;

const REVALIDATE_SECONDS = 60 * 60;

const repoSlug = (): string => new URL(siteConfig.repo).pathname.replace(/^\/|\/$/g, "");

const fetchStars = async (): Promise<number | null> => {
  try {
    const res = await fetch(`https://api.github.com/repos/${repoSlug()}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "fileonchain-web" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: unknown };
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch {
    return null;
  }
};

const fetchWeeklyDownloads = async (name: string): Promise<NpmPackageStat | null> => {
  try {
    const res = await fetch(
      `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`,
      { next: { revalidate: REVALIDATE_SECONDS } },
    );
    if (!res.ok) return null; // 404 until the package is published
    const data = (await res.json()) as { downloads?: unknown };
    return typeof data.downloads === "number" ? { name, weeklyDownloads: data.downloads } : null;
  } catch {
    return null;
  }
};

export const getSocialProof = async (): Promise<SocialProof> => {
  const [stars, ...npm] = await Promise.all([
    fetchStars(),
    ...SOCIAL_PROOF_PACKAGES.map(fetchWeeklyDownloads),
  ]);
  return { stars, npm: npm.filter((stat): stat is NpmPackageStat => stat !== null) };
};
