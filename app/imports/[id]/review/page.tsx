import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { loadImportReview } from "@/lib/db/server";
import { confirmImportAction, undoImportAction } from "@/lib/imports/actions";

export const dynamic = "force-dynamic";

type ImportReviewPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ImportReviewPage({ params }: ImportReviewPageProps) {
  const { id } = await params;
  const pageData = await loadImportReview(id);

  return (
    <PageShell
      eyebrow="Review"
      title="Import review"
      description="Inspect staged rows, duplicate candidates, and parse issues before committing transactions."
    >
      {pageData.status === "unauthenticated" ? (
        <SetupNotice message="Sign in with Supabase Auth to review imports." />
      ) : pageData.status === "setup_error" ? (
        <SetupNotice message={pageData.message} />
      ) : (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryTile label="Status" value={pageData.data.batch.status} />
            <SummaryTile label="Staged rows" value={pageData.data.counts.total.toString()} />
            <SummaryTile
              label="Parse errors"
              value={pageData.data.counts.parseErrors.toString()}
            />
            <SummaryTile
              label="Duplicate candidates"
              value={pageData.data.counts.duplicates.toString()}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="rounded-lg border border-line bg-white p-5">
              <h2 className="text-base font-semibold text-ink">Uploaded file</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <InfoTerm label="File" value={pageData.data.uploadedFile?.original_filename || "Unknown"} />
                <InfoTerm label="Account" value={pageData.data.account?.name || "Unknown"} />
                <InfoTerm
                  label="Storage path"
                  value={pageData.data.uploadedFile?.storage_path || "Unknown"}
                />
                <InfoTerm
                  label="Rows requiring review"
                  value={pageData.data.counts.requiringReview.toString()}
                />
              </dl>
            </div>
            <div className="rounded-lg border border-line bg-white p-5">
              <h2 className="text-base font-semibold text-ink">Actions</h2>
              <div className="mt-4 space-y-3">
                <form action={confirmImportAction}>
                  <input name="batch_id" type="hidden" value={pageData.data.batch.id} />
                  <button
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={
                      pageData.data.batch.status === "committed" ||
                      pageData.data.batch.status === "undone"
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Confirm import
                  </button>
                </form>
                <form action={undoImportAction}>
                  <input name="batch_id" type="hidden" value={pageData.data.batch.id} />
                  <button
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                    disabled={pageData.data.batch.status !== "committed"}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Undo import
                  </button>
                </form>
                {pageData.data.counts.requiringReview > 0 ? (
                  <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    Invalid rows are skipped until editing is added.
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="overflow-x-auto rounded-lg border border-line bg-white">
            <div className="min-w-[1040px]">
              <div className="grid grid-cols-[0.5fr_0.9fr_2fr_0.9fr_0.7fr_0.8fr_1.4fr] border-b border-line bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <div className="px-4 py-3">Row</div>
                <div className="px-4 py-3">Date</div>
                <div className="px-4 py-3">Description</div>
                <div className="px-4 py-3">Amount</div>
                <div className="px-4 py-3">Direction</div>
                <div className="px-4 py-3">Status</div>
                <div className="px-4 py-3">Issue</div>
              </div>
              {pageData.data.stagedTransactions.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  No staged rows found.
                </div>
              ) : (
                pageData.data.stagedTransactions.map((row) => (
                  <div
                    className="grid grid-cols-[0.5fr_0.9fr_2fr_0.9fr_0.7fr_0.8fr_1.4fr] border-b border-line text-sm last:border-b-0"
                    key={row.id}
                  >
                    <div className="px-4 py-3 text-slate-500">{row.row_number}</div>
                    <div className="px-4 py-3 text-slate-600">
                      {row.transaction_date || "Missing"}
                    </div>
                    <div className="px-4 py-3 font-medium text-ink">
                      {row.description_raw || "Missing"}
                    </div>
                    <div className="px-4 py-3 text-slate-600">
                      {row.amount !== null && row.currency
                        ? formatMoney(row.amount, row.currency)
                        : "Missing"}
                    </div>
                    <div className="px-4 py-3 text-slate-600">{row.direction || "Unknown"}</div>
                    <div className="px-4 py-3 text-slate-600">{row.status}</div>
                    <div className="px-4 py-3 text-slate-600">
                      {row.error_message || (row.duplicate_candidate_transaction_id ? "Duplicate" : "")}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-line bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </article>
  );
}

function InfoTerm({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-700">{value}</dd>
    </div>
  );
}

function SetupNotice({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
      {message}
    </section>
  );
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en", {
    currency,
    style: "currency"
  }).format(amount);
}
