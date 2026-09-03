"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

/**
 * RouteFade — fades the page content in on route change. Mounts once at the
 * layout level so navigations between Upload / Explorer / Cache / Donations
 * / Dashboard feel deliberate rather than jumpy.
 *
 * Deliberately NOT wrapped in `AnimatePresence mode="wait"`: in the App
 * Router the layout's `children` swap in place during a client navigation,
 * so the "exiting" element re-renders with the *new* page content and
 * `onExitComplete` can never fire — the incoming keyed div then never
 * mounts and the page sits invisible at opacity 0 until a hard refresh
 * (this is exactly what broke /explorer → /explorer/[cid]). Exit
 * animations need router-freezing hacks that aren't worth it; an
 * enter-only fade on the remounting keyed div gives the same feel and
 * cannot strand the page.
 *
 * The fade is short (~180ms) so it doesn't fight direct interactions like
 * opening modals or drag-and-drop on the upload page.
 */
const RouteFade = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  // Skip the fade on the very first render so hydration matches the
  // server-rendered output (no opacity-0 flash on a full page load) —
  // the ref flips before any navigation can remount the keyed div.
  const isFirstRender = React.useRef(true);
  React.useEffect(() => {
    isFirstRender.current = false;
  }, []);
  return (
    <motion.div
      key={pathname}
      initial={isFirstRender.current ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="flex-1"
    >
      {children}
    </motion.div>
  );
};

export default RouteFade;
