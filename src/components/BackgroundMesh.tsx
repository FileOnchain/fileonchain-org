"use client";

import * as React from "react";

interface BackgroundMeshProps {
  className?: string;
}

/**
 * BackgroundMesh — slow ambient gradient mesh used behind the hero.
 *
 * Layered radial gradients drift on a 18s loop, producing a continuous,
 * low-effort "warm light moving across the page" effect without resorting
 * to a video background or canvas. The mesh is masked by a vertical
 * fade so it dissolves cleanly into the page background at the bottom.
 */
const BackgroundMesh = ({ className }: BackgroundMeshProps) => (
  <div
    aria-hidden
    className={
      "pointer-events-none absolute inset-0 -z-10 overflow-hidden " + (className ?? "")
    }
  >
    {/* Soft warm-to-cool wash — sits behind everything, never reaches 100% saturation. */}
    <div
      className="absolute inset-0 animate-mesh-drift"
      style={{
        backgroundImage: `
          radial-gradient(at 18% 22%, color-mix(in srgb, var(--mesh-a) 28%, transparent) 0px, transparent 50%),
          radial-gradient(at 78% 18%, color-mix(in srgb, var(--mesh-b) 22%, transparent) 0px, transparent 55%),
          radial-gradient(at 82% 78%, color-mix(in srgb, var(--mesh-c) 18%, transparent) 0px, transparent 55%),
          radial-gradient(at 22% 82%, color-mix(in srgb, var(--mesh-d) 18%, transparent) 0px, transparent 55%)
        `,
        filter: "blur(40px) saturate(1.05)",
      }}
    />

    {/* Hard-edges grid sits above the mesh so the warm light "shines through" it. */}
    <div className="absolute inset-0 bg-grid bg-grid-fade animate-grid-pulse opacity-90" />

    {/* Vertical fade so the hero dissolves into the page bg instead of feeling cut. */}
    <div
      className="absolute inset-x-0 bottom-0 h-40"
      style={{
        background: "linear-gradient(180deg, transparent 0%, var(--background) 95%)",
      }}
    />
  </div>
);

export default BackgroundMesh;
