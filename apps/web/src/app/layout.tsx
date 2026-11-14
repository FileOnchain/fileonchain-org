import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Instrument_Serif } from "next/font/google";
import AnalyticsGate from "@/components/AnalyticsGate";
import CtaTracker from "@/components/CtaTracker";
import ThemeProvider from "@/components/ThemeProvider";
import AuthSessionProvider from "@/components/providers/AuthSessionProvider";
import WalletPairingProviders from "@/components/providers/WalletPairingProviders";
import VersionWatcher from "@/components/VersionWatcher";
import { ToastProvider } from "@/components/ui/Toast";
import Nav from "@/components/layout/Nav";
import Footer from "@/components/layout/Footer";
import RouteFade from "@/components/layout/RouteFade";
import ScrollProgress from "@/components/ScrollProgress";
import { siteConfig, gaId, googleSiteVerification } from "@/lib/site";
import { ORGANIZATION_ID, WEBSITE_ID, serializeJsonLd } from "@/lib/structured-data";
import "./globals.css";

const geistSans = localFont({
  src: "../app/fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "../app/fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  display: "swap",
});

/**
 * Instrument Serif — used for the hero display heading & section kicker words.
 *
 * Picked specifically because it's a contemporary serif with optical sizing,
 * distinctive italic, and a quirky contemporary personality that avoids the
 * "Space Grotesk + Inter" AI-generated look while staying performant (single
 * variable file, weights 400 normal + 400 italic from Google Fonts).
 */
const instrumentSerif = Instrument_Serif({
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.title,
    // Sub-pages set a short `title` string; it renders as "Page · FileOnChain".
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  manifest: "/favicon/site.webmanifest",
  // No canonical here on purpose: `alternates` is inherited wholesale, so a
  // root canonical of "/" made every route without its own (404s, error
  // pages, nested workspace pages) declare the homepage as its canonical
  // URL. Each indexable page sets its own through `pageMetadata()`; the
  // homepage sets it in `app/page.tsx`.
  alternates: {
    // Advertise both feeds from the root; sub-pages that set their own
    // `alternates` replace this block.
    types: {
      "application/rss+xml": [
        { url: "/blog/feed.xml", title: `${siteConfig.name} blog` },
        { url: "/changelog/feed.xml", title: `${siteConfig.name} changelog` },
      ],
    },
  },
  keywords: [
    "evidence envelope",
    "verifiable evidence",
    "AI agent audit trail",
    "proof of existence",
    "hash anchoring",
    "CID anchoring",
    "onchain storage",
    "Autonomys",
    "Ethereum",
    "Solana",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: siteConfig.title,
    description: siteConfig.ogDescription,
    url: siteConfig.url,
    siteName: siteConfig.name,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.ogDescription,
    site: siteConfig.twitter,
    creator: siteConfig.twitter,
  },
  // Emits <meta name="google-site-verification"> only when the token is set.
  verification: googleSiteVerification
    ? { google: googleSiteVerification }
    : undefined,
};

/**
 * Viewport + theme-color. The browser UI tint tracks the active theme:
 * cream in light, near-black in dark — matching `--background` in globals.css.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
  ],
  colorScheme: "light dark",
};

/**
 * Organization + WebSite structured data. Gives search engines an explicit
 * name/URL/logo for the knowledge panel and enables the sitelinks search box.
 */
const structuredData = serializeJsonLd([
  {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    // A square raster logo: Google's logo guidelines want at least 112px
    // and a format Google Images indexes.
    logo: {
      "@type": "ImageObject",
      url: `${siteConfig.url}/favicon/web-app-manifest-512x512.png`,
      width: 512,
      height: 512,
    },
    sameAs: [siteConfig.socials.twitter, siteConfig.socials.github, siteConfig.repo],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: `${siteConfig.url}/contact`,
    },
  },
  {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    inLanguage: "en",
    publisher: { "@id": ORGANIZATION_ID },
    // Site search is a CID lookup: the explorer has no `?q=` parameter, but
    // every CID resolves at its detail route.
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteConfig.url}/explorer/{search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  },
]);

const themeBootstrapScript = `
try {
  var t = localStorage.getItem('fileonchain-theme');
  if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', t === 'dark');
  document.documentElement.style.colorScheme = t;
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Pre-hydration theme application prevents the FOUC flash for dark users. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: structuredData }}
        />
      </head>
      <body className="bg-background text-foreground font-sans min-h-screen flex flex-col antialiased">
        <ThemeProvider>
          <AuthSessionProvider>
            <WalletPairingProviders>
              <ToastProvider>
                <VersionWatcher />
                <ScrollProgress />
                <Nav />
                <RouteFade>
                  <div className="flex-1">{children}</div>
                </RouteFade>
                <Footer />
              </ToastProvider>
            </WalletPairingProviders>
          </AuthSessionProvider>
        </ThemeProvider>
        {/* Delegated `data-cta` click tracking; inert without a GA id. */}
        {gaId ? <CtaTracker /> : null}
      </body>
      {/* Google Analytics 4 — mounts only when NEXT_PUBLIC_GA_ID is configured
          AND the user's analytics-cookies preference allows it. */}
      {gaId ? <AnalyticsGate gaId={gaId} /> : null}
    </html>
  );
}
