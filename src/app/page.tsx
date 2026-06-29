import FileUploader from "@/components/FileUploaderClient";
import Hero from "@/components/Hero";
import AnimatedGridBackground from "@/components/AnimatedGridBackground";

// The page is gated behind client-only wallet extensions that touch `window`
// at module-evaluation time, so skip static prerendering and render at request
// time instead.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="relative flex flex-col items-center px-4 py-12 md:px-6 md:py-20">
      <AnimatedGridBackground />
      <div className="relative z-10 w-full max-w-5xl flex flex-col items-center gap-12">
        <Hero />
        <FileUploader />
      </div>
    </main>
  );
}