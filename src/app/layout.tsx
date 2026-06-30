import type { Metadata } from "next";
import localFont from "next/font/local";
import { Instrument_Serif } from "next/font/google";
import ThemeProvider from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import Nav from "@/components/layout/Nav";
import Footer from "@/components/layout/Footer";
import RouteFade from "@/components/layout/RouteFade";
import ScrollProgress from "@/components/ScrollProgress";
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
  title: "FileOnChain — Multichain Onchain Storage",
  description:
    "Upload files permanently to Autonomys, Ethereum, Base, Optimism, Arbitrum, Polygon, Solana, and Aptos. Anchor CIDs onchain. Pay for private cache. Donate to keep public cache alive.",
  applicationName: "FileOnChain",
  manifest: "/favicon/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "FileOnChain — Multichain Onchain Storage",
    description:
      "Permanent onchain file storage across 10 chains. Anchor CIDs, pay for private cache, support public infrastructure.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FileOnChain — Multichain Onchain Storage",
    description:
      "Permanent onchain file storage across 10 chains. Anchor CIDs, pay for private cache, support public infrastructure.",
  },
};

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
      </head>
      <body className="bg-background text-foreground font-sans min-h-screen flex flex-col antialiased">
        <ThemeProvider>
          <ToastProvider>
            <ScrollProgress />
            <Nav />
            <RouteFade>
              <div className="flex-1">{children}</div>
            </RouteFade>
            <Footer />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
