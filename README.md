# PersonalFin

PersonalFin is an ingestion-first personal finance planning dashboard. The MVP starts with uploaded financial exports, import review, and normalized transaction records.

This app intentionally does not include AI features, investment/debt simulation, or any hardcoded personal financial data.

## Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Supabase browser and server clients
- Supabase Storage and Postgres
- Zod environment validation

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

Run parser tests:

```bash
npm run test
```

## Supabase Setup

Create a Supabase project for PersonalFin and collect:

- Project URL
- Anon public key
- Service role key
- Pooled database connection string
- Direct database connection string

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

### Testing With A Fake CSV

Create a small CSV locally with non-personal sample data:

```csv
Date,Description,Amount,Balance
2026-05-01,Salary,1000.00,1000.00
2026-05-02,Groceries,-125.50,874.50
```

Then:

1. Sign in through Supabase Auth.
2. Create an account on `/accounts`.
3. Upload the CSV on `/uploads`.
4. Review staged rows on `/imports/[id]/review`.
5. Confirm the import.
6. View normalized transactions on `/transactions`.

Undo is available from the review page after a batch has been committed.

## Vercel Deployment

1. Import `DiveshSingh97/PersonalFin` into Vercel.
2. Set the framework preset to Next.js.
3. Add the required environment variables for Production, Preview, and Development as appropriate.
4. Deploy from the main branch after the PR is merged.

Vercel sets `NODE_ENV=production` automatically during production builds.

## Required Environment Variables

The full variable guide lives in `docs/financial-planning-dashboard/environment-variables.md`.

Required for the MVP:

```text
NEXT_PUBLIC_APP_URL
NODE_ENV
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
```

Optional for later work:

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
- `/accounts`
- `/uploads`
- `/transactions`
- `/imports`
- `/imports/[id]/review`

## Next Recommended Task

Add review editing and column mapping controls so invalid staged rows can be corrected before commit.
