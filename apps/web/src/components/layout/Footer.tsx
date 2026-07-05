import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { FaGithub, FaLinkedin, FaTwitter } from "react-icons/fa";
import { MAINNET_CHAINS, CHAIN_FAMILIES, CHAIN_FAMILY_LABELS } from "@fileonchain/sdk";
import { siteConfig } from "@/lib/site";

const GITHUB_REPO = "https://github.com/FileOnchain/fileonchain-org";

const PRODUCT_LINKS = [
  { href: "/", label: "Upload" },
  { href: "/explorer", label: "Explorer" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/cache", label: "Private cache" },
  { href: "/donations", label: "Donations" },
  { href: "/dashboard", label: "Dashboard" },
] as const;

const RESOURCE_LINKS = [
  { href: "/docs", label: "SDK documentation", internal: true },
  { href: GITHUB_REPO, label: "GitHub repository" },
  { href: `${GITHUB_REPO}/tree/main/packages/sdk`, label: "SDK · @fileonchain/sdk" },
  { href: `${GITHUB_REPO}/tree/main/contracts`, label: "Contracts" },
  { href: "/#faq", label: "FAQ", internal: true },
] as const;

const ORG_SOCIALS = [
  { href: siteConfig.socials.github, label: "FileOnChain on GitHub", Icon: FaGithub },
  { href: siteConfig.socials.twitter, label: "FileOnChain on X", Icon: FaTwitter },
] as const;

const AUTHOR_LINKS = [
  { href: "https://github.com/marc-aurele-besner", label: "Marc-Aurèle on GitHub", Icon: FaGithub },
  {
    href: "https://www.linkedin.com/in/marc-aurele-besner/",
    label: "Marc-Aurèle on LinkedIn",
    Icon: FaLinkedin,
  },
  { href: "https://x.com/marcaureleb", label: "Marc-Aurèle on X", Icon: FaTwitter },
] as const;

const columnHeading =
  "text-[10px] font-semibold uppercase tracking-[0.22em] text-muted";
const footerLink =
  "text-sm text-muted transition-colors duration-base hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:rounded-sm";
const iconLink =
  "text-muted transition-colors duration-base hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:rounded";

/**
 * Footer — bottom of the layout chrome. Lives in `layout.tsx` (not page) so
 * it persists across routes. Reserves flow space (no `fixed bottom-0`) so it
 * never overlaps content.
 *
 * Server component on purpose: pure navigation + brand chrome, no motion, so
 * it ships zero client JS and is always present in static HTML.
 */
const Footer = () => (
  <footer className="mt-16 border-t border-border bg-surface/40">
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <div className="grid gap-10 md:grid-cols-12">
        {/* Brand column ------------------------------------------------ */}
        <div className="flex flex-col items-start gap-4 md:col-span-5">
          <Link
            href="/"
            className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:rounded-md"
            aria-label="FileOnChain home"
          >
            <Image
              src="/logo/svg/fileonchain-logo-white-blue.svg"
              alt=""
              width={28}
              height={28}
              className="dark:hidden"
            />
            <Image
              src="/logo/svg/fileonchain-logo-clear-blue.svg"
              alt=""
              width={28}
              height={28}
              className="hidden dark:block"
            />
            <span className="font-semibold tracking-tight text-foreground">
              {siteConfig.name}
            </span>
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            Permanent file storage, anchored one transaction at a time across{" "}
            {CHAIN_FAMILIES.length} chain families — from EVM and Substrate to
            Cardano, TON, and Hedera.
          </p>
          <div className="flex items-center gap-3">
            {ORG_SOCIALS.map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className={iconLink}
              >
                <Icon size={18} />
              </a>
            ))}
          </div>
        </div>

        {/* Link columns ------------------------------------------------ */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
          <nav aria-label="Product" className="flex flex-col gap-3">
            <p className={columnHeading}>Product</p>
            <ul className="flex flex-col gap-2">
              {PRODUCT_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className={footerLink}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Resources" className="flex flex-col gap-3">
            <p className={columnHeading}>Resources</p>
            <ul className="flex flex-col gap-2">
              {RESOURCE_LINKS.map(({ href, label, ...rest }) => (
                <li key={href}>
                  {"internal" in rest ? (
                    <Link href={href} className={footerLink}>
                      {label}
                    </Link>
                  ) : (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={footerLink}
                    >
                      {label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Networks" className="flex flex-col gap-3">
            <p className={columnHeading}>Networks</p>
            {/* Two sub-columns: twelve families would otherwise double the
                footer's height next to the six-item link columns. */}
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
              {CHAIN_FAMILIES.map((family) => {
                const count = MAINNET_CHAINS.filter((c) => c.family === family).length;
                return (
                  <li key={family}>
                    <Link
                      href={`/explorer?runtime=${family}`}
                      className={`${footerLink} inline-flex items-baseline gap-1.5`}
                    >
                      {CHAIN_FAMILY_LABELS[family]}
                      <span className="font-mono text-[11px] tabular-nums text-muted/70">
                        {count}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>

      {/* Legal / meta bar --------------------------------------------- */}
      <div className="hairline mt-10 opacity-60" />
      <div className="mt-6 flex flex-col items-center justify-between gap-3 text-xs text-muted sm:flex-row">
        <p>
          © {new Date().getFullYear()} {siteConfig.name} ·{" "}
          <a
            href={`${GITHUB_REPO}/blob/main/LICENSE`}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors duration-base hover:text-foreground"
          >
            MIT License
          </a>
        </p>
        <p className="font-mono text-[11px]">
          {MAINNET_CHAINS.length} chains · anchored forever
        </p>
        <div className="flex items-center gap-3">
          <span>Built by Marc-Aurèle Besner</span>
          {AUTHOR_LINKS.map(({ href, label, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className={iconLink}
            >
              <Icon size={14} />
            </a>
          ))}
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
