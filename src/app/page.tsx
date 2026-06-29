import Image from "next/image";
import Link from "next/link";
import FileUploader from "@/components/FileUploader";
import Footer from "@/components/Footer";

// The page is gated behind client-only wallet extensions that touch `window`
// at module-evaluation time, so skip static prerendering and render at request
// time instead.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-24 bg-black text-white">
      <div className="flex flex-col items-center mb-8">
        <Link href="/">
          <Image src="/logo/logo.png" alt="Logo" width={150} height={150} />
        </Link>
        <h1 className="text-4xl mt-4">Upload File Onchain</h1>
        <h3 className="text-lg mt-2">
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
