import type { Metadata } from "next";
import { Geist_Mono, Inter, Poppins } from "next/font/google";

import { Providers } from "@/components/providers";

import "./globals.css";

/*
 * Inter carries the interface; Poppins 600 is reserved for the wordmark and
 * page titles (it shares Product Sans's geometry, which the Kognoz site uses);
 * Geist Mono for reference numbers, ids and confidence figures. All three are
 * self-hosted by next/font — no layout shift, no third-party request.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "RFP Studio", template: "%s · RFP Studio" },
  description: "Kognoz Consulting — draft, review and approve RFP responses.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning covers only the `class` next-themes writes before hydration.
    <html
      lang="en"
      className={`${inter.variable} ${poppins.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
