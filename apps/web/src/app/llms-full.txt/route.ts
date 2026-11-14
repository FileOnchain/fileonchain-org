import { buildLlmsFullTxt } from "@/lib/llms";

/** `/llms-full.txt`: the long-form companion to `/llms.txt`, see `lib/llms.ts`. */
export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  return new Response(await buildLlmsFullTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
