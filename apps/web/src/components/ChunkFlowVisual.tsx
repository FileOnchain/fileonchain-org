"use client";

import * as React from "react";
import { motion } from "framer-motion";

/**
 * ChunkFlowVisual — editorial diagram that shows the FileOnChain pipeline:
 *   File → split into 64 KiB chunks → each anchor carries cid + the bytes
 *   themselves (the `d` field) → written into the chain's ledger.
 *
 * The sample math is honest: a 184 KB photo splits into exactly the three
 * 64 KiB chunks drawn. Pure SVG, scales to its container, animated with
 * framer-motion + CSS keyframes. Lives on the right half of the hero on
 * desktop and below the heading on mobile.
 */

const MONO = "ui-monospace, 'JetBrains Mono', Menlo, monospace";

const SAMPLE_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const SAMPLE_CID_2 = "bafybeibv3zaicqsdwfmq5dym6ipxzl5qxksirv3d3uyzjqhs2dtx3w3c3q";
const SAMPLE_CID_3 = "bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";

interface ChunkNodeProps {
  x: number;
  y: number;
  index: number;
  cid: string;
  delay?: number;
}

const ChunkNode = ({ x, y, index, cid, delay = 0 }: ChunkNodeProps) => (
  <motion.g
    initial={{ opacity: 0, scale: 0.6, y: 8 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    transition={{
      duration: 0.5,
      delay: 0.4 + delay,
      ease: [0.16, 1, 0.3, 1],
    }}
  >
    <rect
      x={x - 92}
      y={y - 22}
      width={184}
      height={44}
      rx={8}
      fill="var(--surface-elevated)"
      stroke="var(--border)"
      strokeWidth={1}
    />
    <circle cx={x - 76} cy={y} r={10} fill="var(--primary)" opacity={0.12} />
    <text
      x={x - 76}
      y={y + 3.5}
      textAnchor="middle"
      fontSize={11}
      fontWeight={700}
      fill="var(--primary)"
      fontFamily="var(--font-sans)"
    >
      {String(index + 1).padStart(2, "0")}
    </text>
    <text
      x={x - 58}
      y={y - 4}
      fontSize={8}
      fill="var(--muted)"
      fontFamily={MONO}
    >
      cid · sha-256
    </text>
    <text
      x={x - 58}
      y={y + 10}
      fontSize={10}
      fill="var(--foreground)"
      fontFamily={MONO}
    >
      {cid.slice(0, 10)}…{cid.slice(-4)}
    </text>
    {/* The chunk's own bytes ride along in the anchor — the `d` field.
        Drawn as a base64 strip: 64 KiB of real data, not just a hash. */}
    <text x={x + 46} y={y - 4} fontSize={8} fill="var(--accent)" fontFamily={MONO}>
      d: 64 KiB
    </text>
    {[
      { yOff: 2, w: 36 },
      { yOff: 8, w: 30 },
      { yOff: 14, w: 20 },
    ].map(({ yOff, w }) => (
      <line
        key={yOff}
        x1={x + 46}
        y1={y - 6 + yOff}
        x2={x + 46 + w}
        y2={y - 6 + yOff}
        stroke="var(--accent)"
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.45}
      />
    ))}
  </motion.g>
);

const ChunkFlowVisual = () => {
  return (
    <div className="relative w-full max-w-[560px] mx-auto">
      <svg
        viewBox="0 0 520 360"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
        role="img"
        aria-label="How FileOnChain works: a file is split into 64 KiB chunks, each anchor carries the chunk's CID and its bytes, and the chain's ledger stores the file itself."
      >
        <defs>
          <linearGradient id="flowGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.1} />
            <stop offset="50%" stopColor="var(--accent)" stopOpacity={0.95} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="ledgerGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--surface-elevated)" />
            <stop offset="100%" stopColor="var(--surface)" />
          </linearGradient>
          <pattern id="hashGrid" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.6" fill="var(--border)" />
          </pattern>
        </defs>

        {/* File card (input) */}
        <motion.g
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <rect
            x={16}
            y={28}
            width={140}
            height={84}
            rx={12}
            fill="url(#ledgerGrad)"
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text x={30} y={48} fontSize={9} fill="var(--muted)" fontFamily="var(--font-sans)" letterSpacing={1.2}>
            INPUT
          </text>
          {/* Photo thumbnail — the input is data, not metadata. */}
          <g transform="translate(30,56)">
            <rect width={30} height={38} rx={4} fill="var(--surface)" stroke="var(--border)" />
            <circle cx={9} cy={11} r={3.5} fill="var(--accent)" opacity={0.55} />
            <path
              d="M3 30 L11 20 L17 26 L22 21 L27 27 L27 34 L3 34 Z"
              fill="var(--primary)"
              opacity={0.35}
            />
          </g>
          <text x={68} y={70} fontSize={12} fontWeight={600} fill="var(--foreground)" fontFamily="var(--font-sans)">
            photo.jpg
          </text>
          <text x={68} y={85} fontSize={9} fill="var(--muted)" fontFamily={MONO}>
            184 KB
          </text>
          <text x={68} y={98} fontSize={9} fill="var(--muted)" fontFamily={MONO}>
            raw bytes
          </text>
        </motion.g>

        {/* Splitter arrow */}
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <line x1={160} y1={70} x2={214} y2={70} stroke="url(#flowGrad)" strokeWidth={2} strokeDasharray="4 4">
            <animate attributeName="stroke-dashoffset" from="16" to="0" dur="0.8s" repeatCount="indefinite" />
          </line>
          <polygon points="214,65 224,70 214,75" fill="var(--accent)" />
          <text x={190} y={56} textAnchor="middle" fontSize={8} fill="var(--muted)" fontFamily="var(--font-sans)" letterSpacing={1}>
            SPLIT
          </text>
          <text x={190} y={88} textAnchor="middle" fontSize={8} fill="var(--muted)" fontFamily={MONO}>
            3 × 64 KiB
          </text>
        </motion.g>

        {/* Three chunk nodes stacked — the heart of the visual */}
        <ChunkNode x={342} y={62} index={0} cid={SAMPLE_CID} delay={0} />
        <ChunkNode x={342} y={122} index={1} cid={SAMPLE_CID_2} delay={0.08} />
        <ChunkNode x={342} y={182} index={2} cid={SAMPLE_CID_3} delay={0.16} />

        {/* Link arrows from each chunk to onchain ledger */}
        {[62, 122, 182].map((y, i) => (
          <motion.line
            key={y}
            x1={434}
            y1={y}
            x2={474}
            y2={y}
            stroke="var(--primary)"
            strokeWidth={1.2}
            strokeDasharray="3 3"
            opacity={0}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ duration: 0.4, delay: 0.8 + i * 0.06 }}
          >
            <animate attributeName="stroke-dashoffset" from="12" to="0" dur="1.2s" repeatCount="indefinite" />
          </motion.line>
        ))}

        {/* The onchain "ledger" panel — vertical stack of hash entries */}
        <motion.g
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <rect
            x={474}
            y={16}
            width={40}
            height={212}
            rx={8}
            fill="var(--surface-elevated)"
            stroke="var(--border)"
            strokeWidth={1}
          />
          <rect x={474} y={16} width={40} height={212} rx={8} fill="url(#hashGrid)" opacity={0.6} />

          {/* Ledger entry markers */}
          {[44, 84, 124, 164, 204].map((y, i) => (
            <motion.circle
              key={y}
              cx={494}
              cy={y}
              r={3}
              fill="var(--primary)"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 0.4,
                delay: 0.9 + i * 0.08,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          ))}

          {/* Block number label */}
          <text
            x={494}
            y={250}
            textAnchor="middle"
            fontSize={8}
            fill="var(--muted)"
            fontFamily={MONO}
          >
            block #18,402,991
          </text>
        </motion.g>

        {/* Footer caption */}
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.4 }}
        >
          <line x1={16} y1={290} x2={504} y2={290} stroke="var(--grid-line)" />
          <text
            x={16}
            y={310}
            fontSize={10}
            fill="var(--muted)"
            fontFamily="var(--font-sans)"
            letterSpacing={2}
          >
            FIG · 01
          </text>
          <text
            x={16}
            y={330}
            fontSize={12}
            fill="var(--foreground)"
            fontFamily="var(--font-sans)"
          >
            <tspan fontStyle="italic" fontFamily="var(--font-display)">Three chunks</tspan>, one chain — bytes included.
          </text>
          <text
            x={16}
            y={348}
            fontSize={10}
            fill="var(--muted)"
            fontFamily="var(--font-sans)"
          >
            Each anchor carries its chunk&apos;s data, so the chain itself holds the file.
          </text>
        </motion.g>

        {/* A subtle "approved" stamp floating */}
        <motion.g
          initial={{ opacity: 0, rotate: -8 }}
          animate={{ opacity: 0.85, rotate: -8 }}
          transition={{ duration: 0.6, delay: 1.6 }}
        >
          <g transform="translate(408, 240)">
            <rect
              x={-64}
              y={-12}
              width={128}
              height={24}
              rx={4}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
            <text
              x={0}
              y={4}
              textAnchor="middle"
              fontSize={10}
              fontWeight={700}
              letterSpacing={2}
              fill="var(--accent)"
              fontFamily="var(--font-sans)"
            >
              STORED ON-CHAIN
            </text>
          </g>
        </motion.g>
      </svg>
    </div>
  );
};

export default ChunkFlowVisual;
