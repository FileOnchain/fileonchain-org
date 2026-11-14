import { serializeJsonLd, type JsonLdNode } from "@/lib/structured-data";

/**
 * Server-rendered JSON-LD block. Pass one node, or several to emit them as
 * an `@graph`. Only mark up what the page visibly shows.
 */
export default function JsonLd({ data }: { data: JsonLdNode | JsonLdNode[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
