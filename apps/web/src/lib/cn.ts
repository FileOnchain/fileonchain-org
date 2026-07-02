import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combine class names with Tailwind conflict resolution.
 * Used by every UI primitive so consumers can override styles safely.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}