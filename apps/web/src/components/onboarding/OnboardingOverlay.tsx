"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { FiArrowRight, FiCheck, FiLayers, FiShield, FiUpload } from "react-icons/fi";
import {
  ACTIVE_CHAINS,
  ACTIVE_FAMILIES,
  CHAIN_FAMILY_LABELS,
  type ChainFamily,
} from "@fileonchain/sdk";

/**
 * OnboardingOverlay — first-visit 3-step walkthrough. Shows the next three
 * things a new user needs to do: choose what to seal (anchor-only vs
 * storage), pick a live network, sign and get the envelope. Persists
 * completion in localStorage so it doesn't replay every visit.
 *
 * Every network count, name and wallet hint below is derived from the
 * chain registry (`ACTIVE_CHAINS` / `ACTIVE_FAMILIES`), so the copy never
 * describes a network beyond its rollout status. When a family flips to
 * `status: "active"` its wallets show up here automatically; add a row to
 * `FAMILY_WALLETS` for a family the map does not know yet.
 *
 * Motion language: bold sans typography (no italic/gradient), staggered
 * icon + body reveal, a blinking caret effect on the lead phrase, and a
 * progress dot bar that morphs between styles (neutral / active / done).
 */

const STORAGE_KEY = "fileonchain:onboarding-complete-v1";

/** Example wallets per runtime, surfaced only for families with a live
 * network. Keep in step with `INJECTED_WALLET_COPY` in
 * `components/chain/WalletConnectPanel.tsx`. */
const FAMILY_WALLETS: Partial<Record<ChainFamily, string>> = {
  evm: "MetaMask",
  substrate: "a Substrate extension like Talisman",
  solana: "Phantom",
  aptos: "Petra",
  cosmos: "Keplr",
  sui: "a Sui wallet like Slush",
  starknet: "Argent",
  near: "a NEAR wallet",
  tron: "TronLink",
  cardano: "a Cardano wallet like Lace",
  ton: "a TON Connect wallet",
  hedera: "HashPack",
};

/** "A, B and C" for short lists of names. */
const joinNames = (names: readonly string[]): string =>
  names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const LIVE_MAINNETS = ACTIVE_CHAINS.filter((c) => !c.testnet).map((c) => c.name);
const LIVE_TESTNETS = ACTIVE_CHAINS.filter((c) => c.testnet).map((c) => c.name);
const LIVE_RUNTIMES = ACTIVE_FAMILIES.map((family) => CHAIN_FAMILY_LABELS[family]);
const LIVE_WALLETS = ACTIVE_FAMILIES.flatMap((family) => {
  const wallet = FAMILY_WALLETS[family];
  return wallet ? [wallet] : [];
});

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
    title: "Choose what to seal",
    lead: "Hash first.",
    body: (
      <>
        Drop a file, a release, or an agent run. It is hashed in your browser, so the
        bytes stay with you unless you opt in. Pick{" "}
        <strong className="text-foreground">anchor-only evidence</strong> (hash, signatures,
        receipts), on-chain storage for the bytes themselves, or a link to a copy you
        already host.
      </>
    ),
    Icon: FiUpload,
  },
  {
    n: "02",
    title: "Pick a live network",
    lead: "Start anywhere live.",
    body: (
      <>
        <strong className="text-foreground">
          {ACTIVE_CHAINS.length} networks
        </strong>{" "}
        are open for anchoring today across the {joinNames(LIVE_RUNTIMES)} runtimes:{" "}
        {joinNames(LIVE_MAINNETS)} on mainnet, plus {joinNames(LIVE_TESTNETS)} for
        testing. Roadmap adapters show on the networks grid but cannot be selected.
      </>
    ),
    Icon: FiLayers,
  },
  {
    n: "03",
    title: "Sign and get your envelope",
    lead: "That's it.",
    body: (
      <>
        Connect a wallet for the runtime you picked ({joinNames(LIVE_WALLETS)}) and
        sign. It only signs the anchor transaction and never sees your file. You pay
        each network&apos;s ordinary transaction fee; the registry itself charges
        nothing. Out comes one portable evidence package anyone can verify locally.
      </>
    ),
    Icon: FiShield,
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
          className="fixed inset-0 z-100 flex items-center justify-center px-4"
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
