import Link from "next/link";
import { AlertTriangle, CheckCircle2, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { AuthNotice } from "@/components/auth-notice";
import {
  Card,
  EmptyState,
  SetupNotice,
  StatusBadge,
  fieldClassName,
  primaryButtonClassName,
  secondaryButtonClassName
} from "@/components/ui";
import { loadImportReview } from "@/lib/db/server";
import {
  bulkUpdateStagedRowsAction,
  confirmImportAction,
  undoImportAction,
  updateImportMappingAction,
  updateStagedRowAction
} from "@/lib/imports/actions";
import { formatInteger, formatMoney } from "@/lib/format";
import type { FinancialAccount, ImportBatch, StagedTransaction, UploadedFile } from "@/lib/db/types";
import type { StagedStatusCounts } from "@/lib/imports/review";

export const dynamic = "force-dynamic";

type ImportReviewPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const mappingFields = [
  ["mapping_date", "Transaction date", "date"],
  ["mapping_postedDate", "Posted date", "postedDate"],
  ["mapping_description", "Description", "description"],
  ["mapping_amount", "Amount", "amount"],
  ["mapping_debit", "Debit", "debit"],
  ["mapping_credit", "Credit", "credit"],
  ["mapping_balance", "Balance", "balance"],
  ["mapping_currency", "Currency", "currency"]
] as const;

const stagedStatusOptions = ["approved", "invalid", "duplicate", "skipped", "needs_review"] as const;

type ReviewData = {
  batch: ImportBatch;
  account: FinancialAccount | null;
  uploadedFile: UploadedFile | null;
  stagedTransactions: StagedTransaction[];
  sourceColumns: string[];
  counts: StagedStatusCounts;
};

export default async function ImportReviewPage({ params }: ImportReviewPageProps) {
  const { id } = await params;
  const pageData = await loadImportReview(id);

  return (
    <PageShell
      eyebrow="Review"
      title="Import review"
      description="Correct staged data, tune column mapping, and commit only rows that are ready."
    >
      {pageData.status === "unauthenticated" ? (
        <AuthNotice message="Sign in with Supabase Auth to review imports." />
      ) : pageData.status === "setup_error" ? (
        <SetupNotice message={pageData.message} />
      ) : (
        <ReviewContent data={pageData.data} />
      )}
    </PageShell>
  );
}

function ReviewContent({ data }: { data: ReviewData }) {
  const isLocked = data.batch.status === "committed" || data.batch.status === "undone";
  const warnBeforeConfirm =
    data.counts.invalid + data.counts.duplicate + data.counts.skipped + data.counts.needs_review > 0;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryTile label="Status" value={<StatusBadge status={data.batch.status} />} />
        <SummaryTile label="Approved" value={formatInteger(data.counts.approved)} />
        <SummaryTile label="Invalid" value={formatInteger(data.counts.invalid)} />
        <SummaryTile label="Duplicates" value={formatInteger(data.counts.duplicate)} />
        <SummaryTile label="Skipped" value={formatInteger(data.counts.skipped)} />
        <SummaryTile label="Needs review" value={formatInteger(data.counts.needs_review)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink">Import context</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Raw upload metadata and the account that owns this import batch.
              </p>
            </div>
            <Link
              className="text-sm font-semibold text-cyan-800 hover:text-cyan-950"
              href="/imports"
            >
              Back to imports
            </Link>
          </div>
          <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
            <InfoTerm label="File" value={data.uploadedFile?.original_filename || "Unknown"} />
            <InfoTerm label="Account" value={data.account?.name || "Unknown"} />
            <InfoTerm label="Provider" value={data.account?.institution_name || "Unspecified"} />
            <InfoTerm label="Format" value={data.batch.source_format || "Unknown"} />
            <InfoTerm label="Storage path" value={data.uploadedFile?.storage_path || "Unknown"} wide />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink">Commit safety</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Only approved rows are inserted into transactions. Everything else stays in staging.
          </p>
          {warnBeforeConfirm ? (
            <div className="mt-4 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Confirming will skip invalid, duplicate, skipped, and needs-review rows.
            </div>
          ) : null}
          <div className="mt-4 space-y-3">
            <form action={confirmImportAction}>
              <input name="batch_id" type="hidden" value={data.batch.id} />
              <button className={primaryButtonClassName} disabled={isLocked}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Confirm approved rows
              </button>
            </form>
            <form action={undoImportAction}>
              <input name="batch_id" type="hidden" value={data.batch.id} />
              <button className={secondaryButtonClassName} disabled={data.batch.status !== "committed"}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Undo committed import
              </button>
            </form>
          </div>
        </Card>
      </section>

      <Card className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Column mapping</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Re-map source columns and reprocess this batch before committing. Raw upload metadata is unchanged.
            </p>
          </div>
          {isLocked ? (
            <StatusBadge status={data.batch.status} />
          ) : (
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800">
              Editable before commit
            </span>
          )}
        </div>
        <form action={updateImportMappingAction} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input name="batch_id" type="hidden" value={data.batch.id} />
          {mappingFields.map(([name, label, key]) => (
            <label className="block text-sm font-medium text-slate-700" key={name}>
              {label}
              <select
                className={fieldClassName}
                defaultValue={mappingValue(data.batch.mapping_json, key)}
                disabled={isLocked}
                name={name}
              >
                <option value="">Unmapped</option>
                {data.sourceColumns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="md:col-span-2 xl:col-span-4">
            <button className={primaryButtonClassName} disabled={isLocked || data.sourceColumns.length === 0}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Save mapping and reprocess staged rows
            </button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink">Staged rows</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Edit rows directly in staging. Final transactions are created only when you confirm the import.
              </p>
            </div>
            <form action={bulkUpdateStagedRowsAction} className="flex flex-wrap gap-2" id="bulk-staged-form">
              <input name="batch_id" type="hidden" value={data.batch.id} />
              <button className={secondaryButtonClassName} disabled={isLocked} name="bulk_action" value="approve">
                Approve selected
              </button>
              <button className={secondaryButtonClassName} disabled={isLocked} name="bulk_action" value="skip">
                Skip selected
              </button>
              <button className={secondaryButtonClassName} disabled={isLocked} name="bulk_action" value="needs_review">
                Needs review
              </button>
              <button
                className={secondaryButtonClassName}
                disabled={isLocked}
                name="bulk_action"
                value="approve_duplicates"
              >
                Override duplicate
              </button>
            </form>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[1320px]">
            <div className="grid grid-cols-[44px_70px_150px_140px_280px_120px_110px_130px_130px_220px] border-b border-line bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div className="px-3 py-3">Pick</div>
              <div className="px-3 py-3">Row</div>
              <div className="px-3 py-3">Date</div>
              <div className="px-3 py-3">Posted</div>
              <div className="px-3 py-3">Description</div>
              <div className="px-3 py-3">Amount</div>
              <div className="px-3 py-3">Currency</div>
              <div className="px-3 py-3">Direction</div>
              <div className="px-3 py-3">Status</div>
              <div className="px-3 py-3">Issue</div>
            </div>
            {data.stagedTransactions.length === 0 ? (
              <EmptyState
                title="No staged rows"
                description="Upload an export first, then return here to review parsed transactions."
              />
            ) : (
              data.stagedTransactions.map((row) => {
                const formId = `row-${row.id}`;

                return (
                  <form
                    action={updateStagedRowAction}
                    className="grid grid-cols-[44px_70px_150px_140px_280px_120px_110px_130px_130px_220px] items-start border-b border-line text-sm last:border-b-0"
                    id={formId}
                    key={row.id}
                  >
                    <input name="batch_id" type="hidden" value={data.batch.id} />
                    <input name="row_id" type="hidden" value={row.id} />
                    <div className="px-3 py-3">
                      <input
                        aria-label={`Select row ${row.row_number}`}
                        disabled={isLocked}
                        form="bulk-staged-form"
                        name="row_id"
                        type="checkbox"
                        value={row.id}
                      />
                    </div>
                    <div className="px-3 py-3 text-slate-500">{row.row_number}</div>
                    <div className="px-3 py-2">
                      <input
                        className={fieldClassName}
                        defaultValue={row.transaction_date || ""}
                        disabled={isLocked}
                        name="transaction_date"
                        type="date"
                      />
                    </div>
                    <div className="px-3 py-2">
                      <input
                        className={fieldClassName}
                        defaultValue={row.posted_date || ""}
                        disabled={isLocked}
                        name="posted_date"
                        type="date"
                      />
                    </div>
                    <div className="px-3 py-2">
                      <input
                        className={fieldClassName}
                        defaultValue={row.description_raw || ""}
                        disabled={isLocked}
                        name="description_raw"
                      />
                    </div>
                    <div className="px-3 py-2">
                      <input
                        className={fieldClassName}
                        defaultValue={row.amount ?? ""}
                        disabled={isLocked}
                        name="amount"
                        step="0.01"
                        type="number"
                      />
                      {row.amount !== null && row.currency ? (
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {formatMoney(row.amount, row.currency)}
                        </p>
                      ) : null}
                    </div>
                    <div className="px-3 py-2">
                      <input
                        className={fieldClassName}
                        defaultValue={row.currency || data.account?.currency || "ZAR"}
                        disabled={isLocked}
                        maxLength={3}
                        name="currency"
                      />
                    </div>
                    <div className="px-3 py-2">
                      <select
                        className={fieldClassName}
                        defaultValue={row.direction || ""}
                        disabled={isLocked}
                        name="direction"
                      >
                        <option value="">Unknown</option>
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                        <option value="transfer">Transfer</option>
                      </select>
                    </div>
                    <div className="px-3 py-2">
                      <select
                        className={fieldClassName}
                        defaultValue={row.status}
                        disabled={isLocked || row.status === "committed"}
                        name="status"
                      >
                        {stagedStatusOptions.map((status) => (
                          <option key={status} value={status}>
                            {status.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                      <div className="mt-2">
                        <StatusBadge status={row.status} />
                      </div>
                    </div>
                    <div className="px-3 py-2">
                      <p className="min-h-6 text-xs leading-5 text-slate-600">
                        {row.error_message ||
                          (row.duplicate_candidate_transaction_id
                            ? `Duplicate ${row.duplicate_candidate_transaction_id.slice(0, 8)}`
                            : "No issue")}
                      </p>
                      <button className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-cyan-800 hover:text-cyan-950" disabled={isLocked || row.status === "committed"}>
                        <Save className="h-3.5 w-3.5" aria-hidden="true" />
                        Save row
                      </button>
                    </div>
                  </form>
                );
              })
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 text-2xl font-semibold text-ink">{value}</div>
    </Card>
  );
}

function InfoTerm({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-700">{value}</dd>
    </div>
  );
}

function mappingValue(mapping: Record<string, unknown>, key: string) {
  const value = mapping[key];
  return typeof value === "string" ? value : "";
}
