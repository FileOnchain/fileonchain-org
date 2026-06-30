"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiArrowRight, FiCheck, FiLayers, FiShield, FiUpload } from "react-icons/fi";

/**
 * OnboardingOverlay — first-visit 3-step walkthrough. Shows the next three
 * things a new user needs to do: pick a chain → connect a wallet → drop a
 * file. Persists completion in localStorage so it doesn't replay every
 * visit.
 *
 * Motion language: bold sans typography (no italic/gradient), staggered
 * icon + body reveal, a blinking caret effect on the lead phrase, and a
 * progress dot bar that morphs between styles (neutral / active / done).
 */

const STORAGE_KEY = "fileonchain:onboarding-complete-v1";

interface Step {
  n: string;
  title: string;
  lead: string;
  body: React.ReactNode;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}

const STEPS: Step[] = [
  {
    n: "01",
    title: "Pick a chain",
    lead: "Start anywhere.",
    body: (
      <>
        FileOnChain anchors CIDs on <strong className="text-foreground">10 chains</strong> across
        four families — EVM, Substrate, Solana, Aptos. Switch any time from the chain selector.
      </>
    ),
    Icon: FiLayers,
  },
  {
    n: "02",
    title: "Connect a wallet",
    lead: "Sign once, anchor forever.",
    body: (
      <>
        Use any wallet that fits the chain family — MetaMask, Phantom, Petra, or a Substrate
        extension. The wallet only signs the registry tx; it never sees your file.
      </>
    ),
    Icon: FiShield,
  },
  {
    n: "03",
    title: "Drop a file",
    lead: "That's it.",
    body: (
      <>
        Drag onto the dropzone or paste a CID into the explorer. Chunks, CIDs, and the
        onchain anchor all happen automatically — you can retrieve anywhere, anytime.
      </>
    ),
    Icon: FiUpload,
  },
];

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const OnboardingOverlay = () => {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // ignore
    }
    if (!dismissed) {
      const t = window.setTimeout(() => setOpen(true), 700);
      return () => window.clearTimeout(t);
    }
    return;
  }, []);

  const dismiss = React.useCallback((mark: "skip" | "finish") => {
    setOpen(false);
    try {
      if (mark === "finish") window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  const next = React.useCallback(() => {
    setStep((s) => {
      if (s >= STEPS.length - 1) {
        dismiss("finish");
        return s;
      }
      return s + 1;
    });
  }, [dismiss]);

  const back = React.useCallback(() => {
    setStep((s) => (s > 0 ? s - 1 : s));
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss("skip");
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, next, back, dismiss]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const Icon = current.Icon;

  return (
    <AnimatePresence>
      {open && current && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to FileOnChain"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-background/80 backdrop-blur-md"
            onClick={() => dismiss("skip")}
          />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className="surface-lift relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border p-6 md:p-8"
          >
            {/* Animated noise strip top — purely decorative. */}
            <motion.div
              aria-hidden
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ duration: 2.4, delay: 0.2, ease: "easeInOut", repeat: Infinity, repeatDelay: 2 }}
              className="absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--primary)_8%,transparent),transparent)]"
            />

            {/* Step header */}
            <div className="relative mb-5 flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-widest text-muted">
                WELCOME · STEP {current.n}
              </span>
              <button
                type="button"
                onClick={() => dismiss("skip")}
                className="text-xs font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:rounded"
              >
                Skip
              </button>
            </div>

            {/* Icon */}
            <motion.div
              key={current.n}
              initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 0.45, ease: EASE_OUT }}
              className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-primary/10 text-primary"
            >
              <Icon size={24} />
            </motion.div>

            {/* Copy */}
            <AnimatePresence mode="wait">
              <motion.div
                key={current.n}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.25 }}
              >
                <p className="text-2xl font-bold leading-tight text-foreground">
                  {current.lead}
                  <span
                    aria-hidden
                    className="ml-0.5 inline-block h-5 w-[2px] translate-y-0.5 bg-primary animate-caret"
                  />
                </p>
                <h2 className="mt-1 text-base font-medium text-muted">{current.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">{current.body}</p>
              </motion.div>
            </AnimatePresence>

            {/* Progress dots */}
            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center gap-2" role="tablist" aria-label="Onboarding progress">
                {STEPS.map((s, i) => {
                  const isActive = i === step;
                  const isDone = i < step;
                  return (
                    <button
                      key={s.n}
                      type="button"
                      onClick={() => setStep(i)}
                      aria-label={`Go to step ${i + 1}`}
                      aria-current={isActive ? "step" : undefined}
                      className={
                        "h-2 rounded-full transition-all duration-base ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
                        (isActive
                          ? "w-8 bg-primary"
                          : isDone
                            ? "w-2 bg-success"
                            : "w-2 bg-border")
                      }
                    />
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={back}
                    className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Back
                  </button>
                )}
                <motion.button
                  type="button"
                  onClick={next}
                  whileHover={{ y: -1 }}
                  whileTap={{ y: 1 }}
                  transition={{ duration: 0.15 }}
                  className="group inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated"
                >
                  {isLast ? (
                    <>
                      <FiCheck size={14} />
                      Got it
                    </>
                  ) : (
                    <>
                      Next
                      <FiArrowRight
                        size={14}
                        className="transition-transform duration-base group-hover:translate-x-0.5"
                      />
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OnboardingOverlay;
