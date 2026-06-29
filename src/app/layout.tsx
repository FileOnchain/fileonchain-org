import type { Metadata } from "next";
import localFont from "next/font/local";
import ThemeProvider from "@/components/ThemeProvider";
import Nav from "@/components/layout/Nav";
import Footer from "@/components/layout/Footer";
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

export const metadata: Metadata = {
  title: "FileOnChain — Multichain Onchain Storage",
  description:
    "Upload files permanently to Autonomys, Ethereum, Base, Optimism, Arbitrum, Polygon, Solana, and Aptos. Anchor CIDs onchain. Pay for private cache. Donate to keep public cache alive.",
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
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Pre-hydration theme application prevents the FOUC flash for dark users. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="bg-background text-foreground font-sans min-h-screen flex flex-col">
        <ThemeProvider>
          <Nav />
          <div className="flex-1">{children}</div>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}