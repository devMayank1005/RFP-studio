import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * Is the viewport narrower than the tablet breakpoint?
 *
 * A subscription to the media query rather than a setState-in-effect, so the
 * first client render already knows the answer and never double-renders. The
 * server snapshot is `false`: the shell renders desktop-first and the sidebar
 * collapses on the client if it must.
 */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
