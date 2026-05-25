# PersonalFin

PersonalFin is an ingestion-first personal finance planning dashboard. The MVP starts with a clean Next.js foundation for uploaded financial exports, import review, and normalized transaction records.

This scaffold intentionally does not include AI features, a database schema, or any hardcoded personal financial data.

## Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Supabase browser and server clients
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
DATABASE_URL
DIRECT_URL
```

Optional for later work:

```text
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

## Next Recommended Task

Add the ingestion data model and import specification, then implement the upload pipeline:

1. Store raw files in private Supabase Storage.
2. Create an import batch for every upload.
3. Parse CSV/XLSX rows into staging records.
4. Review mappings and uncertain rows.
5. Detect duplicates before committing normalized transactions.
6. Keep every import batch undoable.
