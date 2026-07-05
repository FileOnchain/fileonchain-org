"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiAlertCircle, FiCheck, FiInfo, FiX } from "react-icons/fi";
import { cn } from "@/lib/cn";

export type ToastVariant = "default" | "success" | "danger" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms. Pass 0 to keep the toast until dismissed. */
  duration?: number;
  /** Optional call-to-action rendered under the description. */
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // Stub fallback for SSR / contexts outside provider — no-op.
    return {
      toast: () => {},
      dismiss: () => {},
    };
  }
  return ctx;
};

const VARIANT_STYLES: Record<ToastVariant, string> = {
  default: "border-border bg-surface-elevated text-foreground",
  success: "border-success/40 bg-success/10 text-foreground",
  danger: "border-danger/40 bg-danger/10 text-foreground",
  warning: "border-warning/40 bg-warning/10 text-foreground",
  info: "border-info/40 bg-info/10 text-foreground",
};

const VARIANT_ICONS: Record<ToastVariant, React.ReactNode> = {
  default: <FiInfo size={16} />,
  success: <FiCheck size={16} className="text-success" />,
  danger: <FiAlertCircle size={16} className="text-danger" />,
  warning: <FiAlertCircle size={16} className="text-warning" />,
  info: <FiInfo size={16} className="text-info" />,
};

let idCounter = 0;
const nextId = () => `t-${++idCounter}`;

/**
 * ToastProvider — mounts a portal of stacked toasts in the bottom-right.
 * `useToast()` exposes a `toast()` function with the shape above.
 */
export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback<ToastContextValue["toast"]>(
    (input) => {
      const id = nextId();
      const full: Toast = { id, duration: 4000, ...input };
      setToasts((prev) => [...prev, full]);
      if (full.duration) {
        window.setTimeout(() => dismiss(id), full.duration);
      }
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[min(90vw,22rem)]"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 shadow-elev-2",
                VARIANT_STYLES[t.variant ?? "default"],
              )}
            >
              <span className="mt-0.5 shrink-0">{VARIANT_ICONS[t.variant ?? "default"]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-xs text-muted break-words">{t.description}</p>
                )}
                {t.action && (
                  <button
                    type="button"
                    onClick={t.action.onClick}
                    className="mt-2 inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-md p-1 text-muted hover:text-foreground hover:bg-surface transition-colors"
              >
                <FiX size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;