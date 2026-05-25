import { FileSpreadsheet, Upload } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export default function UploadsPage() {
  return (
    <PageShell
      eyebrow="Raw files"
      title="Uploads"
      description="Placeholder for CSV and XLSX upload flows. Raw files will be stored privately before parsing and review."
    >
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-cyan-50 text-cyan-700">
          <Upload className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-ink">Upload flow coming next</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
          The next milestone can connect Supabase Storage, parse bank exports, and create reviewable import batches.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-md border border-line bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <FileSpreadsheet className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          CSV and XLSX imports
        </div>
      </section>
    </PageShell>
  );
}
