import type { Metadata } from "next";
import * as React from "react";
import { getProfile } from "@/lib/mock/profiles";
import { truncateAddress } from "@/lib/cid/format";
import { siteConfig } from "@/lib/site";
import ProfileClient from "@/components/profile/ProfileClient";

interface PageProps {
  params: Promise<{ address: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { address } = await params;
  const decoded = decodeURIComponent(address);
  const profile = await getProfile(decoded);
  const canonical = `/profile/${decoded}`;
  const display = profile.handle ?? truncateAddress(decoded);
  const known = profile.stats.anchors > 0;

  const title = `${display} · Profile`;
  const description = known
    ? `${display} has anchored ${profile.stats.files} files (${profile.stats.anchors} onchain anchors) across ${profile.stats.chains} chains on FileOnChain.`
    : `Public FileOnChain profile for ${display}. No public anchors indexed yet.`;

  return {
    title,
    description,
    alternates: { canonical },
    // Address space is unbounded — only index profiles with real activity.
    // Explicit in both branches so the parent layout's noindex (meant for
    // the /profile entry point) is never inherited here.
    robots: known
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      title: `${title} · ${siteConfig.name}`,
      description,
      url: canonical,
      type: "profile",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Server component — resolves the profile (by canonical or linked address)
 * and hands rendering to the client so wallet state can mark ownership.
 */
export default async function ProfilePage({ params }: PageProps) {
  const { address } = await params;
  const decoded = decodeURIComponent(address);
  const profile = await getProfile(decoded);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteConfig.url },
      {
        "@type": "ListItem",
        position: 2,
        name: "Leaderboard",
        item: `${siteConfig.url}/leaderboard`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: profile.handle ?? truncateAddress(profile.address),
        item: `${siteConfig.url}/profile/${profile.address}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <ProfileClient profile={profile} />
    </>
  );
}
