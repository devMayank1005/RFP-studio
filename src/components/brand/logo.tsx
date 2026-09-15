import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The Kognoz globe mark — the "O" of the wordmark, cropped from the brand
 * logo. Rendered from a transparent PNG rather than redrawn, so the gradient
 * and the rays are exactly the brand's.
 */
export function KognozMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/brand/kognoz-mark.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      priority
      style={{ width: size, height: size }}
      className={cn("shrink-0 select-none", className)}
    />
  );
}

/** Full KOGNOZ wordmark (blue, with the globe as the O). */
export function KognozWordmark({ className, width = 120 }: { className?: string; width?: number }) {
  return (
    <Image
      src="/brand/kognoz-logo.png"
      alt="Kognoz"
      width={width}
      height={Math.round(width * (132 / 800))}
      priority
      className={cn("h-auto w-auto select-none", className)}
    />
  );
}

/**
 * The app's own lockup: mark + "RFP Studio" in Poppins, with "by Kognoz" as
 * the eyebrow. Used in the sidebar header and on the sign-in card.
 */
export function AppLockup({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <KognozMark size={compact ? 24 : 30} />
      {!compact && (
        <div className="flex flex-col leading-none">
          <span className="font-heading text-[15px] font-semibold tracking-tight text-foreground">
            RFP Studio
          </span>
          <span className="mt-0.5 text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            by Kognoz
          </span>
        </div>
      )}
    </div>
  );
}
