import Image from "next/image";
import Link from "next/link";
import FileUploader from "@/components/FileUploaderClient";

// The page is gated behind client-only wallet extensions that touch `window`
// at module-evaluation time, so skip static prerendering and render at request
// time instead.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-6 md:p-12 bg-background text-foreground">
      <div className="flex flex-col items-center mb-8 text-center">
        <Link href="/" aria-label="FileOnChain">
          <Image
            src="/logo/svg/fileonchain-logo-white-blue.svg"
            alt="FileOnChain"
            width={120}
            height={120}
            className="dark:hidden"
            priority
          />
          <Image
            src="/logo/svg/fileonchain-logo-clear-blue.svg"
            alt="FileOnChain"
            width={120}
            height={120}
            className="hidden dark:block"
            priority
          />
        </Link>
        <h1 className="text-4xl mt-4 text-primary">Upload File Onchain</h1>
        <h3 className="text-lg mt-2 text-muted">
          Upload files permanently on Autonomys Network
        </h3>
      </div>
      <div className="flex-grow flex items-center justify-center w-full">
        <FileUploader />
      </div>
    </main>
  );
}