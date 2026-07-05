import { HttpError } from "@/lib/server/http-error";

/**
 * Catch-all for unmatched `/api/*` paths. Explicit routes always win over
 * this dynamic segment — it only fires when nothing else matched, so API
 * clients get a JSON 404 instead of the HTML not-found page.
 */
const notFound = () => new HttpError(404, "API route not found").toResponse();

export {
  notFound as GET,
  notFound as POST,
  notFound as PUT,
  notFound as PATCH,
  notFound as DELETE,
  notFound as HEAD,
  notFound as OPTIONS,
};
