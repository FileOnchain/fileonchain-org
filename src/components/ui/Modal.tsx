"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { FiX } from "react-icons/fi";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  hideClose?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
} as const;

/**
 * Modal — accessible dialog with framer-motion enter/exit. Radix provides
 * focus trap, escape-to-close, and aria semantics; framer-motion adds the
 * soft scale + fade entrance.
 */
export const Modal = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  hideClose = false,
  className,
}: ModalProps) => {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
                  "w-[calc(100vw-2rem)] sm:w-full",
                  sizeClasses[size],
                  "rounded-xl border border-border bg-surface-elevated shadow-elev-3",
                  "p-5 md:p-6 max-h-[90vh] overflow-y-auto",
                  className,
                )}
              >
                {(title || !hideClose) && (
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                      {title && (
                        <Dialog.Title className="text-lg font-semibold text-foreground">
                          {title}
                        </Dialog.Title>
                      )}
                      {description && (
                        <Dialog.Description className="mt-1 text-sm text-muted">
                          {description}
                        </Dialog.Description>
                      )}
                    </div>
                    {!hideClose && (
                      <Dialog.Close
                        aria-label="Close"
                        className="shrink-0 rounded-md p-1.5 text-muted hover:text-foreground hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <FiX size={18} />
                      </Dialog.Close>
                    )}
                  </div>
                )}
                <div>{children}</div>
                {footer && (
                  <div className="mt-5 flex flex-wrap items-center justify-end gap-2">{footer}</div>
                )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
};

export default Modal;