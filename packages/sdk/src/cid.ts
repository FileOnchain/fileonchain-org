/**
 * CIDv1 base32 (lowercase) detection — a reasonable surface-level validator.
 * Real CIDs may also be base58 or base16; this matches the most common form.
 * A folder anchors exactly like a file: through the CID of its DAG root.
 */
export const CIDV1_BASE32_RE = /^b[a-z2-7]{58,}$/;

export const isValidCID = (value: string): boolean => CIDV1_BASE32_RE.test(value.trim());

export const validateOrError = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return "Enter a CID to search.";
  if (!CIDV1_BASE32_RE.test(trimmed)) {
    return "Not a valid CIDv1 base32 (should start with 'b' followed by 58+ lowercase letters/digits).";
  }
  return null;
};
