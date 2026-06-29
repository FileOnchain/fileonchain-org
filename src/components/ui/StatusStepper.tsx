"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { FiCheck, FiCircle, FiLoader } from "react-icons/fi";
import { cn } from "@/lib/cn";

export type StepState = "idle" | "active" | "done" | "error";

export interface Step {
  id: string;
  label: string;
  description?: string;
}

interface StatusStepperProps {
  steps: Step[];
  current: string;
  states?: Record<string, StepState>;
  className?: string;
}

/**
 * StatusStepper — horizontal / vertical progress indicator. Used in upload,
 * payment, and donation flows to show where the user is.
 */
export const StatusStepper = ({ steps, current, states = {}, className }: StatusStepperProps) => {
  const currentIndex = Math.max(
    0,
    steps.findIndex((s) => s.id === current),
  );

  return (
    <ol
      role="list"
      aria-live="polite"
      className={cn("flex flex-col gap-3", className)}
    >
      {steps.map((step, idx) => {
        const state = states[step.id] ?? (idx < currentIndex ? "done" : idx === currentIndex ? "active" : "idle");
        const isLast = idx === steps.length - 1;

        return (
          <li key={step.id} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <motion.div
                initial={false}
                animate={{
                  scale: state === "active" ? 1.1 : 1,
                }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2",
                  state === "done" && "bg-success border-success text-white",
                  state === "active" && "bg-primary border-primary text-primary-foreground",
                  state === "error" && "bg-danger border-danger text-white",
                  state === "idle" && "border-border bg-surface text-muted",
                )}
              >
                {state === "done" ? (
                  <FiCheck size={14} />
                ) : state === "active" ? (
                  <FiLoader size={14} className="animate-spin" />
                ) : (
                  <FiCircle size={14} />
                )}
              </motion.div>
              {!isLast && (
                <span
                  className={cn(
                    "mt-1 h-8 w-0.5",
                    idx < currentIndex ? "bg-success" : "bg-border",
                  )}
                />
              )}
            </div>
            <div className="flex-1 pt-0.5">
              <p
                className={cn(
                  "text-sm font-medium",
                  state === "idle" ? "text-muted" : "text-foreground",
                )}
              >
                {step.label}
              </p>
              {step.description && <p className="text-xs text-muted">{step.description}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default StatusStepper;