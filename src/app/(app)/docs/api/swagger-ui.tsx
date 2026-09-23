"use client";

import { useEffect, useRef, useState } from "react";

const VERSION = "5.17.14";
const CDN = `https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/${VERSION}`;

declare global {
  interface Window {
    SwaggerUIBundle?: (opts: Record<string, unknown>) => unknown;
  }
}

/** Loads Swagger UI from cdnjs once and mounts it on the spec. */
export function SwaggerUi({ specUrl }: { specUrl: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${CDN}/swagger-ui.min.css`;
    document.head.appendChild(css);

    const mount = () => {
      if (cancelled || !host.current || !window.SwaggerUIBundle) return;
      window.SwaggerUIBundle({ url: specUrl, domNode: host.current, deepLinking: true, docExpansion: "list", defaultModelsExpandDepth: 0 });
    };
    if (window.SwaggerUIBundle) mount();
    else {
      const script = document.createElement("script");
      script.src = `${CDN}/swagger-ui-bundle.min.js`;
      script.async = true;
      script.onload = mount;
      script.onerror = () => setError("Swagger UI could not be loaded from cdnjs. The raw spec is at " + specUrl);
      document.body.appendChild(script);
    }
    return () => {
      cancelled = true;
      css.remove();
    };
  }, [specUrl]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4 pb-8 text-[13px] dark:bg-card">
      {error && <p className="p-4 text-ui text-meaning-red-text">{error}</p>}
      <div ref={host} />
    </div>
  );
}
