"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

/**
 * RouteFade — fades the page content in on route change. Mounts once at the
 * layout level so navigations between Upload / Explorer / Cache / Donations
 * / Dashboard feel deliberate rather than jumpy.
 *
 * The fade is short (~180ms) so it doesn't fight direct interactions like
 * opening modals or drag-and-drop on the upload page.
 */
const RouteFade = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

export default RouteFade;
