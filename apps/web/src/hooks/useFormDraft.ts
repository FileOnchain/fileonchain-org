"use client";

import * as React from "react";

/**
 * useFormDraft — keeps a form's in-progress values in sessionStorage so a
 * page refresh (e.g. the "new version available" toast in VersionWatcher)
 * never loses what the user typed. Drafts are session-scoped: they survive
 * reloads but not closing the tab.
 *
 * - `value` must be JSON-serializable; it is written (debounced) while
 *   `enabled` is true.
 * - `restore` is called at most once per mount, with the stored draft, the
 *   first time the form becomes enabled — gate modals with `enabled: open`
 *   so drafts re-apply when the dialog opens after a reload.
 * - Call `clearDraft()` wherever the form resets (successful submit,
 *   cancel) so stale drafts don't resurface later.
 *
 * Never pass secrets (BYOK provider keys, API-key material) — sessionStorage
 * is plaintext.
 */

const DRAFT_PREFIX = "fileonchain:draft:";
const WRITE_DEBOUNCE_MS = 250;

interface UseFormDraftOptions<T> {
  /** Gate persistence + restoration, e.g. a modal's `open` flag. Default true. */
  enabled?: boolean;
  /** Applies a stored draft back onto the form's state. */
  restore: (draft: T) => void;
}

export function useFormDraft<T>(
  key: string,
  value: T,
  { enabled = true, restore }: UseFormDraftOptions<T>,
): { clearDraft: () => void } {
  const storageKey = DRAFT_PREFIX + key;
  const restoreRef = React.useRef(restore);
  restoreRef.current = restore;
  const restoredRef = React.useRef(false);

  const clearDraft = React.useCallback(() => {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Storage unavailable (privacy mode) — drafts silently disabled.
    }
  }, [storageKey]);

  // Restore once, the first time the form is enabled after mount.
  React.useEffect(() => {
    if (!enabled || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw !== null) restoreRef.current(JSON.parse(raw) as T);
    } catch {
      clearDraft();
    }
  }, [enabled, storageKey, clearDraft]);

  // Persist (debounced) while enabled; disabling cancels any pending write,
  // so a close-and-reset never re-saves the values it just cleared.
  React.useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        // Storage unavailable or full — losing the draft is acceptable.
      }
    }, WRITE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, value, storageKey]);

  return { clearDraft };
}

export default useFormDraft;
