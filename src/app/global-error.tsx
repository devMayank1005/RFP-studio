"use client";

import { useEffect } from "react";

/**
 * The root boundary: only reached when the root layout itself fails, so it
 * renders its own document and uses no app styles or fonts. Server-side
 * detail is already in the logs (src/instrumentation.ts); the reference
 * shown here is the digest that finds it.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] root error", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Inter, system-ui, sans-serif", background: "#f8f9fb", color: "#111827" }}>
        <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>RFP Studio hit an unexpected error</h1>
          <p style={{ maxWidth: 420, fontSize: 14, color: "#6b7280", margin: 0 }}>Reload to try again. If it keeps happening, send the reference below to whoever runs the app.</p>
          {error.digest ? (
            <p style={{ fontSize: 12, color: "#9ca3af", fontVariantNumeric: "tabular-nums", margin: 0 }}>Reference {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 8, padding: "8px 16px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", font: "inherit" }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
