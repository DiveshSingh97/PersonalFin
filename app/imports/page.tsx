import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { loadImports } from "@/lib/db/server";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const pageData = await loadImports();

  return (
    <PageShell
      eyebrow="Import batches"
      title="Imports"
      description="Review staged imports, track parse results, and manage confirmed or undone batches."
    >
      {pageData.status === "unauthenticated" ? (
        <SetupNotice message="Sign in with Supabase Auth to view imports." />
      ) : pageData.status === "setup_error" ? (
        <SetupNotice message={pageData.message} />
      ) : (
        <section className="overflow-x-auto rounded-lg border border-line bg-white">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[1.4fr_1fr_0.8fr_0.6fr_0.6fr_0.6fr_0.6fr_0.9fr_0.7fr] border-b border-line bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div className="px-4 py-3">File</div>
              <div className="px-4 py-3">Account</div>
              <div className="px-4 py-3">Status</div>
              <div className="px-4 py-3">Rows</div>
              <div className="px-4 py-3">Imported</div>
              <div className="px-4 py-3">Dupes</div>
              <div className="px-4 py-3">Failed</div>
              <div className="px-4 py-3">Created</div>
              <div className="px-4 py-3">Review</div>
            </div>
            {pageData.data.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                No import batches yet.
              </div>
            ) : (
              pageData.data.map((batch) => (
                <div
                  className="grid grid-cols-[1.4fr_1fr_0.8fr_0.6fr_0.6fr_0.6fr_0.6fr_0.9fr_0.7fr] border-b border-line text-sm last:border-b-0"
                  key={batch.id}
                >
                  <div className="px-4 py-3 font-medium text-ink">
                    {batch.uploaded_files?.original_filename || "Unknown file"}
                  </div>
                  <div className="px-4 py-3 text-slate-600">
                    {batch.financial_accounts?.name || "Unknown account"}
                  </div>
                  <div className="px-4 py-3 text-slate-600">{batch.status}</div>
                  <div className="px-4 py-3 text-slate-600">{batch.total_rows}</div>
                  <div className="px-4 py-3 text-slate-600">{batch.committed_rows}</div>
                  <div className="px-4 py-3 text-slate-600">{batch.duplicate_rows}</div>
                  <div className="px-4 py-3 text-slate-600">{batch.error_rows}</div>
                  <div className="px-4 py-3 text-slate-600">{formatDate(batch.created_at)}</div>
                  <div className="px-4 py-3">
                    <Link
                      className="font-semibold text-cyan-700 hover:text-cyan-900"
                      href={`/imports/${batch.id}/review`}
                    >
                      Open
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </PageShell>
  );
}

function SetupNotice({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
      {message}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}
