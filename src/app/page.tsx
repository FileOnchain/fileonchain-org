import Image from "next/image";
import Link from "next/link";
import FileUploader from "@/components/FileUploaderClient";
import Footer from "@/components/Footer";
import ThemeSwitch from "@/components/ThemeSwitch";

// The page is gated behind client-only wallet extensions that touch `window`
// at module-evaluation time, so skip static prerendering and render at request
// time instead.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-24 bg-background text-foreground">
      <ThemeSwitch />
      <div className="flex flex-col items-center mb-8">
        <Link href="/">
          <Image
            src="/logo/svg/fileonchain-logo-white-blue.svg"
            alt="Logo"
            width={150}
            height={150}
            className="dark:hidden"
            priority
          />
          <Image
            src="/logo/svg/fileonchain-logo-clear-blue.svg"
            alt="Logo"
            width={150}
            height={150}
            className="hidden dark:block"
            priority
          />
        </Link>
        <h1 className="text-4xl mt-4 text-primary">Upload File Onchain</h1>
        <h3 className="text-lg mt-2 text-muted">
          Upload files permanently on Autonomys Network
        </h3>
      </div>
      <div className="flex-grow flex items-center justify-center">
        <FileUploader />
      </div>
      <Footer />
    </main>
  );
}