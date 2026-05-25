import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { AuthNotice } from "@/components/auth-notice";
import { Card, EmptyState, SetupNotice, StatusBadge } from "@/components/ui";
import { loadImports } from "@/lib/db/server";
import { formatDate } from "@/lib/format";

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
        <AuthNotice message="Sign in with Supabase Auth to view imports." />
      ) : pageData.status === "setup_error" ? (
        <SetupNotice message={pageData.message} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
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
                <EmptyState
                  title="No import batches yet"
                  description="Upload a CSV or XLSX export to create the first staged import review."
                  action={
                    <Link className="font-semibold text-cyan-800 hover:text-cyan-950" href="/uploads">
                      Upload export
                    </Link>
                  }
                />
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
                    <div className="px-4 py-3">
                      <StatusBadge status={batch.status} />
                    </div>
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
          </div>
        </Card>
      )}
    </PageShell>
  );
}
