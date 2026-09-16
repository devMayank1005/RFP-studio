import {
  FileSpreadsheet,
  Lock,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { KognozOfficialLogo } from "@/components/brand/logo";

const CAPABILITIES = [
  {
    icon: FileSpreadsheet,
    tag: "Darwinbox HCM",
    title: "Darwinbox Advisory & Multi-Matrix Parsing",
    description:
      "Automated extraction of nested client RFP spreadsheets, technical matrices, and compliance questionnaires into structured, categorized question workstreams.",
    metric: "100+ matrix requirements / min",
    metricColor: "text-[#005184]",
    accentBg: "bg-[#EEF6FA] border-[#005184]/25 text-[#005184]",
  },
  {
    icon: Users,
    tag: "Centaur Teammates",
    title: "Centaur Consulting: Human + AI Synergy",
    description:
      "Embodying Kognoz's Centaur workforce methodology: pairing consultant expertise with Voyage AI retrieval and keyboard-first review (J/K/A) for rapid sign-off.",
    metric: "4x proposal velocity",
    metricColor: "text-[#548231]",
    accentBg: "bg-[#F1F7EC] border-[#71A247]/35 text-[#548231]",
  },
  {
    icon: ShieldCheck,
    tag: "Behavioral Trust",
    title: "Behavioral Science & Zero-Hallucination Audit",
    description:
      "Every response claim is strictly anchored to verified Kognoz transformation playbooks and client-tested HCM architectures with full source chunk traceability.",
    metric: "100% grounded citations",
    metricColor: "text-[#1E7863]",
    accentBg: "bg-[#EEF7F5] border-[#2B9E85]/35 text-[#1E7863]",
  },
];

const METRICS = [
  { label: "HCM Engagements", value: "50+", sub: "Fortune 500 & Enterprises" },
  { label: "Turnaround Velocity", value: "4x", sub: "Faster Proposal Delivery" },
  { label: "Source Grounding", value: "100%", sub: "Zero Hallucinated Claims" },
];

export function FeatureShowcase() {
  return (
    <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#F7FAFB] via-[#EEF6F8] to-[#E3EFF3] p-8 xl:p-12 text-slate-900 border-r border-slate-200/80 lg:col-span-7 select-none">
      {/* Kognoz Authentic Brand Ambient Glow Wash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 size-[520px] rounded-full bg-[#005184]/10 blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 -right-28 size-[500px] -translate-y-1/2 rounded-full bg-[#2B9E85]/10 blur-[140px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 left-1/4 size-[440px] rounded-full bg-[#71A247]/10 blur-[120px]"
      />

      {/* Subtle Kognoz Consulting Blueprint Grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,#005184_1px,transparent_1px),linear-gradient(to_bottom,#005184_1px,transparent_1px)] [background-size:36px_36px]"
      />

      {/* Top Section: Brand Identity & Positioning */}
      <div className="relative z-10 space-y-6">
        {/* Brand Lockup: Official Kognoz Logo Card & Status Pill */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-3.5 rounded-2xl border border-slate-200/90 bg-white px-5 py-3 shadow-[0_4px_16px_-2px_rgba(0,81,132,0.08)] transition-all hover:shadow-[0_6px_20px_-2px_rgba(0,81,132,0.12)]">
            <KognozOfficialLogo width={160} priority />
            <div className="h-7 w-px bg-slate-200" />
            <div className="flex flex-col">
              <span className="font-heading text-xs font-bold tracking-tight text-[#005184]">
                RFP Studio
              </span>
              <span className="text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
                Intelligence Suite
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-[#2B9E85]/40 bg-[#2B9E85]/10 px-3.5 py-1.5 shadow-2xs">
            <span className="size-2 rounded-full bg-[#2B9E85] animate-pulse" />
            <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-[#1D7762]">
              Darwinbox Partner Suite
            </span>
          </div>
        </div>

        {/* Hero Taglines - Authentic Kognoz Website Identity */}
        <div className="space-y-3 pt-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#005184]">
            <Sparkles className="size-3.5 text-[#2B9E85]" />
            <span>Tech-Driven People Consulting</span>
          </div>

          <h1 className="font-heading text-3xl xl:text-4xl font-semibold tracking-tight text-slate-900 leading-[1.2]">
            Transforming People, Transforming Businesses.{" "}
            <span className="block mt-1 bg-gradient-to-r from-[#005184] via-[#2B9E85] to-[#71A247] bg-clip-text text-transparent">
              Maximizing Human Potential.
            </span>
          </h1>

          <p className="max-w-xl text-xs xl:text-sm text-slate-600 font-normal leading-relaxed">
            Harness the power of behavioral science and agentic AI. Kognoz RFP Studio accelerates
            complex Darwinbox HCM proposals with multi-matrix extraction, verified knowledge retrieval,
            and audit-grade citations.
          </p>
        </div>
      </div>

      {/* Middle Section: Capability Cards */}
      <div className="relative z-10 my-6 space-y-3">
        {CAPABILITIES.map((cap) => {
          const Icon = cap.icon;
          return (
            <div
              key={cap.title}
              className="group relative rounded-xl border border-slate-200/90 bg-white/80 p-3.5 xl:p-4 shadow-[0_2px_8px_-2px_rgba(0,81,132,0.06)] backdrop-blur-xs transition-all duration-300 hover:border-[#005184]/40 hover:bg-white hover:shadow-[0_8px_24px_-4px_rgba(0,81,132,0.12)]"
            >
              <div className="flex items-start gap-3.5">
                <div
                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg border shadow-2xs transition-colors ${cap.accentBg}`}
                >
                  <Icon className="size-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xs xl:text-sm font-semibold text-slate-900 tracking-tight">
                        {cap.title}
                      </h2>
                      <span className="hidden sm:inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {cap.tag}
                      </span>
                    </div>
                    <span className={`text-2xs font-mono font-semibold ${cap.metricColor} shrink-0`}>
                      {cap.metric}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    {cap.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Impact Stats Strip */}
      <div className="relative z-10 grid grid-cols-3 gap-3 rounded-xl border border-slate-200/90 bg-white/85 p-3.5 shadow-[0_2px_8px_-2px_rgba(0,81,132,0.05)] backdrop-blur-xs">
        {METRICS.map((m) => (
          <div key={m.label} className="text-center px-1">
            <div className="font-heading text-lg xl:text-xl font-bold tracking-tight text-[#005184]">
              {m.value}
            </div>
            <div className="text-[11px] font-semibold text-slate-800">{m.label}</div>
            <div className="text-[10px] text-slate-500 hidden xl:block">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Bottom Trust & Compliance Bar */}
      <div className="relative z-10 pt-4 mt-4 border-t border-slate-200/80 flex items-center justify-between text-2xs text-slate-500">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-700">
            <ShieldCheck className="size-3.5 text-[#2B9E85]" />
            <span>Microsoft Entra SSO</span>
          </div>
          <span className="text-slate-300">·</span>
          <div className="flex items-center gap-1.5 text-slate-700">
            <Lock className="size-3.5 text-[#005184]" />
            <span>Encrypted Tenant Isolation</span>
          </div>
        </div>

        <span className="font-mono text-slate-600 font-medium">kognozconsulting.com</span>
      </div>
    </div>
  );
}
