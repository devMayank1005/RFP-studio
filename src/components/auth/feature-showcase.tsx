import {
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Lock,
  ShieldCheck,
} from "lucide-react";

const CAPABILITIES = [
  {
    icon: FileSpreadsheet,
    title: "Multi-Matrix Question Extraction",
    description:
      "Claude 3.5 Sonnet parses nested Excel sheets, tables, and Word RFPs into clean, categorized question workstreams with section mapping.",
    metric: "100+ questions parsed in seconds",
    metricColor: "text-brand-cyan",
  },
  {
    icon: Database,
    title: "Darwinbox & Kognoz Knowledge RAG",
    description:
      "Automated drafting powered by Voyage AI vector search and curated product playbooks, with traceable source citations and confidence metrics.",
    metric: "Zero hallucinated claims",
    metricColor: "text-brand-mint",
  },
  {
    icon: CheckCircle2,
    title: "High-Velocity Review Grid",
    description:
      "Keyboard-first review loop (J/K/A shortcuts) for consultants and reviewers to inspect citations, adjust nuance, and approve client-ready answers.",
    metric: "Real-time audit log & versioning",
    metricColor: "text-brand-green",
  },
];

export function FeatureShowcase() {
  return (
    <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[#07131e] p-10 xl:p-14 text-white lg:col-span-7 select-none">
      {/* Dynamic ambient brand glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 size-[520px] rounded-full bg-[#005184]/40 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 -right-24 size-[480px] -translate-y-1/2 rounded-full bg-[#2b9e85]/20 blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 left-1/3 size-[420px] rounded-full bg-[#32b2ce]/20 blur-[110px]"
      />

      {/* Subtle architectural grid overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:32px_32px]"
      />

      {/* Header with App Lockup */}
      <div className="relative z-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-md mb-8">
          <span className="size-2 rounded-full bg-brand-mint animate-pulse" />
          <span className="text-2xs font-medium uppercase tracking-[0.14em] text-slate-300">
            Internal Consulting Intelligence
          </span>
        </div>

        <div className="space-y-4">
          <h1 className="font-heading text-3xl xl:text-4xl font-semibold tracking-tight text-white leading-[1.2]">
            High-velocity RFP intelligence for Darwinbox consulting.
          </h1>
          <p className="max-w-xl text-sm xl:text-base text-slate-300 font-normal leading-relaxed">
            Accelerate client proposals from ingestion to sign-off. Built specifically for Kognoz
            practice teams delivering enterprise transformation.
          </p>
        </div>
      </div>

      {/* Feature Capability Cards */}
      <div className="relative z-10 my-10 space-y-3.5">
        {CAPABILITIES.map((cap) => {
          const Icon = cap.icon;
          return (
            <div
              key={cap.title}
              className="group relative rounded-xl border border-white/10 bg-white/[0.04] p-4 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.07]"
            >
              <div className="flex items-start gap-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white shadow-xs group-hover:border-brand-mint/40 group-hover:text-brand-mint transition-colors">
                  <Icon className="size-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-medium text-white tracking-tight">{cap.title}</h2>
                    <span className={`text-2xs font-mono font-medium ${cap.metricColor} shrink-0`}>
                      {cap.metric}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-300/90 leading-relaxed">{cap.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Trust & Security Bar */}
      <div className="relative z-10 pt-6 border-t border-white/10 flex items-center justify-between text-2xs text-slate-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-brand-mint" />
            <span>Microsoft Entra SSO</span>
          </div>
          <span className="text-white/20">·</span>
          <div className="flex items-center gap-1.5">
            <Lock className="size-3.5 text-brand-cyan" />
            <span>Encrypted Tenant Isolation</span>
          </div>
        </div>

        <span className="font-mono text-slate-400">v0.1.0 · bom1</span>
      </div>
    </div>
  );
}
