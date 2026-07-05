"use client";

import * as React from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Last-resort boundary — renders only when the root layout itself throws
 * (route-level errors are handled by `app/error.tsx`). It replaces the
 * entire document, so it must ship its own <html>/<body> and cannot rely
 * on globals.css, fonts, or any provider. Styles are inlined; colors match
 * the `--background` values in globals.css for both schemes.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[FileOnChain] Root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          background: "var(--foc-bg)",
          color: "var(--foc-fg)",
        }}
      >
        <style>{`
          :root { --foc-bg: #faf9f6; --foc-fg: #1a1a1a; --foc-muted: #6b6b6b; --foc-border: #e4e2dc; }
          @media (prefers-color-scheme: dark) {
            :root { --foc-bg: #0b0d12; --foc-fg: #f2f2f2; --foc-muted: #9a9a9a; --foc-border: #262a33; }
          }
        `}</style>
        <main
          style={{
            maxWidth: "28rem",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#e5484d",
              margin: 0,
            }}
          >
            Fatal error
          </p>
          <h1 style={{ fontSize: "1.5rem", margin: "0.5rem 0 0" }}>
            FileOnChain hit an unrecoverable error
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--foc-muted)",
              margin: "0.75rem 0 0",
            }}
          >
            The application shell failed to render. Reload the page — if the
            problem persists, please let us know.
          </p>
          {error.digest && (
            <code
              style={{
                display: "inline-block",
                marginTop: "1rem",
                padding: "0.375rem 0.75rem",
                fontSize: "0.75rem",
                fontFamily: "ui-monospace, monospace",
                color: "var(--foc-muted)",
                border: "1px solid var(--foc-border)",
                borderRadius: "0.375rem",
              }}
            >
              {error.digest}
            </code>
          )}
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "center",
              marginTop: "1.5rem",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                height: "2.5rem",
                padding: "0 1rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#ffffff",
                background: "#2f6fed",
                border: "none",
                borderRadius: "0.375rem",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.replace("/")}
              style={{
                height: "2.5rem",
                padding: "0 1rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--foc-fg)",
                background: "transparent",
                border: "1px solid var(--foc-border)",
                borderRadius: "0.375rem",
                cursor: "pointer",
              }}
            >
              Back home
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
