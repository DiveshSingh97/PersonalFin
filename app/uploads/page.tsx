import { FileSpreadsheet, Upload } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { AuthNotice } from "@/components/auth-notice";
import {
  Card,
  EmptyState,
  SetupNotice,
  fieldClassName,
  primaryButtonClassName
} from "@/components/ui";
import { loadUploadFormData } from "@/lib/db/server";
import { uploadImportAction } from "@/lib/imports/actions";

export const dynamic = "force-dynamic";

export default async function UploadsPage() {
  const pageData = await loadUploadFormData();

  return (
    <PageShell
      eyebrow="Raw files"
      title="Uploads"
      description="Upload CSV or XLSX exports, store the raw file privately, and stage rows for review."
    >
      {pageData.status === "unauthenticated" ? (
        <AuthNotice message="Sign in with Supabase Auth to upload files." />
      ) : pageData.status === "setup_error" ? (
        <SetupNotice message={pageData.message} />
      ) : (
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-50 text-cyan-800">
              <Upload className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">New import</h2>
              <p className="text-sm text-slate-600">
                CSV is the reliable MVP path; XLSX files are accepted for basic tabular exports.
              </p>
            </div>
          </div>

          {pageData.data.accounts.length === 0 ? (
            <EmptyState
              title="Create an account first"
              description="Every upload needs an account so duplicates, balances, and transactions stay scoped correctly."
            />
          ) : (
            <form action={uploadImportAction} className="mt-6 grid gap-4 lg:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Account
                <select
                  className={fieldClassName}
                  name="account_id"
                  required
                >
                  {pageData.data.accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.currency})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Source provider
                <input
                  className={fieldClassName}
                  name="source_provider"
                  placeholder="Bank or export source"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700 lg:col-span-2">
                Export file
                <input
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="mt-1 w-full rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-sm text-slate-700 outline-none transition focus:border-cyan-700 focus:ring-2 focus:ring-cyan-100"
                  name="file"
                  required
                  type="file"
                />
              </label>
              <button className={primaryButtonClassName}>
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                Upload and stage
              </button>
            </form>
          )}
        </Card>
      )}
    </PageShell>
  );
}
