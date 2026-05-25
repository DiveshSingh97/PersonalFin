# PersonalFin

PersonalFin is an ingestion-first personal finance planning dashboard. The MVP starts with uploaded financial exports, import review, editable staging, and normalized transaction records.

This app intentionally avoids hardcoded personal financial data. AI may assist with import mapping and later analysis, but financial records must still flow through staging and user review before becoming normalized transactions.

## Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Supabase browser and server clients
- Supabase Auth, Storage, and Postgres
- Zod environment validation
- Vitest for parser and workflow tests

## Local Development

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Fill in the required Supabase values in `.env.local`, then start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

Build locally:

```bash
npm run build
```

Run tests:

```bash
npm run test
```

Run linting:

```bash
npm run lint
```

## Supabase Setup

Create a Supabase project for PersonalFin and collect:

- Project URL
- Anon public key
- Service role key
- Pooled database connection string, optional for the current runtime
- Direct database connection string, optional for the current runtime

Create a private Supabase Storage bucket:

```text
financial-uploads
```

Keep Row Level Security enabled before storing real financial data. The service role key must only be used from server-only code.

### Applying Database Migrations

This project uses Supabase SQL migrations for the ingestion MVP.

With the Supabase CLI:

```bash
supabase link --project-ref your-project-ref
supabase db push
```

For manual setup, open the Supabase SQL editor and run the files in `supabase/migrations` in timestamp order.

The initial migrations create the ingestion tables, indexes, Row Level Security policies, and default transaction categories. They do not create the `financial-uploads` Storage bucket; create that bucket separately and keep it private.

## Current Ingestion Workflow

The current ingestion flow is:

1. Sign in with Supabase Auth.
2. Create or select a financial account on `/accounts`.
3. Upload a CSV or XLSX export on `/uploads`.
4. The raw file is stored in the private `financial-uploads` Supabase Storage bucket.
5. The app creates `uploaded_files` and `import_batches` records.
6. The parser writes extracted rows to `staged_transactions`.
7. Review the import on `/imports/[id]/review`.
8. Check detected mappings, row statuses, duplicate candidates, and parse errors.
9. Adjust mappings or staged rows when that feature is available.
10. Confirm the import to write approved rows into `transactions`.
11. Inspect normalized transactions on `/transactions`.
12. Undo the import from the review page if the batch needs to be rolled back.

Financial rows should never skip staging. The staging table is the safety layer between raw bank exports and the master transaction ledger.

### Supported Upload Types

Current supported upload types:

- CSV
- XLSX

Supported parser behavior includes:

- simple CSV exports
- debit/credit column exports
- XLSX tabular exports
- single-column XLSX files containing CSV-style rows
- FNB-style CSV exports with metadata/preamble rows before the transaction table
- optional AI-assisted mapping fallback when deterministic mapping cannot confidently identify a structure and server-side AI credentials are available

PDF statement ingestion is not part of the current flow yet.

### Testing With A Fake CSV

Create a small CSV locally with non-personal sample data:

```csv
Date,Description,Amount,Balance
2026-05-01,Salary,1000.00,1000.00
2026-05-02,Groceries,-125.50,874.50
2026-05-03,Netflix,-199.00,675.50
2026-05-03,Netflix,-199.00,675.50
```

Then:

1. Sign in through Supabase Auth.
2. Create an account on `/accounts`.
3. Upload the CSV on `/uploads`.
4. Review staged rows on `/imports/[id]/review`.
5. Confirm that the duplicate Netflix row is marked as a duplicate candidate.
6. Confirm the import.
7. View normalized transactions on `/transactions`.
8. Undo the import from the review page if needed.

### Testing With A Synthetic FNB-Style CSV

Use synthetic data only. Do not commit or upload real bank exports to GitHub.

```csv
ACCOUNT TRANSACTION HISTORY

Name:, Test, User
Account:, 123456789, [Easy Account]
Balance:, 707.45, 20861.77

Date, Amount, Balance, Description
2026/05/25, -1222.00, 0.00, FNBCC DCRE1925255 260525
2026/05/25, 22142.60, 0.00, FNB OB PMT Y
2026/05/23, -23.15, 707.45, BYC DEBIT 00000000000
2026/05/22, -110.00, 730.60, PURCH CANVA 400000******0000
2026/05/22, -39.94, 840.60, PURCH DL UBER 400000******0000
2026/05/23, 300.00, 880.54, FNB APP TRANSFER FROM FUEL
2026/05/24, -10.00, 870.54, CR.INT.RATE   4,39000
```

Expected review result:

- metadata rows are ignored
- only transaction rows are staged
- positive amounts are income
- negative amounts are expenses
- descriptions are preserved, including descriptions with unquoted commas
- rows still require review before final commit

## Vercel Deployment

1. Import `DiveshSingh97/PersonalFin` into Vercel.
2. Set the framework preset to Next.js.
3. Add the required environment variables for Production, Preview, and Development as appropriate.
4. Deploy from the main branch after the PR is merged.

Vercel sets `NODE_ENV=production` automatically during production builds.

## Required Environment Variables

The full variable guide lives in `docs/financial-planning-dashboard/environment-variables.md`.

Required for the MVP runtime:

```text
NEXT_PUBLIC_APP_URL
NODE_ENV
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
```

Optional for current runtime or later work:

```text
DATABASE_URL
DIRECT_URL
OPENAI_API_KEY
OPENAI_MODEL_CLASSIFICATION
OPENAI_MODEL_REASONING
APP_ENCRYPTION_KEY
CRON_SECRET
```

Never commit real `.env`, `.env.local`, or `.env.*.local` files.

## Current Routes

- `/`
- `/dashboard`
- `/login`
- `/accounts`
- `/uploads`
- `/transactions`
- `/imports`
- `/imports/[id]/review`

## Near-Term Roadmap

Current priority is ingestion reliability before dashboards or simulations.

Next recommended work:

1. Add import review editing, column mapping controls, and UI polish.
2. Add staged-row bulk actions and safer confirm warnings.
3. Add merchant normalization and transaction category rules.
4. Add recurring transaction and subscription detection.
5. Add dashboard summaries once data is reliably normalized.
6. Add PDF statement ingestion after the review/editing workflow is strong enough to safely correct extracted rows.
