import { buildLlmsTxt } from "@/lib/llms";

/** `/llms.txt`: Markdown site map for answer engines, see `lib/llms.ts`. */
export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  return new Response(await buildLlmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
