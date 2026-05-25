import Link from "next/link";
import { ArrowRight, Database, FileUp, ShieldCheck } from "lucide-react";
import { PageShell } from "@/components/page-shell";

const foundations = [
  {
    title: "Upload raw exports",
    description: "Start with bank CSV and XLSX files, keeping raw uploads separate from normalized records.",
    icon: FileUp
  },
  {
    title: "Normalize into records",
    description: "Treat the database as the source of truth after review, mapping, and duplicate checks.",
    icon: Database
  },
  {
    title: "Protect financial data",
    description: "Use private Supabase storage, server-only secrets, and explicit environment configuration.",
    icon: ShieldCheck
  }
];

export default function Home() {
  return (
    <PageShell
      eyebrow="MVP foundation"
      title="PersonalFin"
      description="An ingestion-first financial planning workspace for uploaded account exports, import review, and clean transaction records."
    >
      <section className="grid gap-4 lg:grid-cols-3">
        {foundations.map((item) => (
          <article
            className="rounded-lg border border-line bg-white p-5 shadow-soft"
            key={item.title}
          >
            <item.icon className="h-5 w-5 text-emerald-700" aria-hidden="true" />
            <h2 className="mt-4 text-base font-semibold text-ink">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
          </article>
        ))}
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          href="/uploads"
        >
          Go to uploads
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          className="inline-flex items-center rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
          href="/dashboard"
        >
          View dashboard
        </Link>
      </div>
    </PageShell>
  );
}
