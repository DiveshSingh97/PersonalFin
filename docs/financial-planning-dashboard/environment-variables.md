# Environment Variables Guide

This document defines the environment variables needed for the PersonalFin ingestion-first MVP.

Do not commit real secrets to GitHub.

## .env.example

```env
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Supabase public client values
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Supabase server-only values
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=financial-uploads

# Database / Prisma
DATABASE_URL=
DIRECT_URL=

# Optional, later AI features
OPENAI_API_KEY=
OPENAI_MODEL_CLASSIFICATION=gpt-5.4-mini
OPENAI_MODEL_REASONING=gpt-5.5

# Optional, later app security
APP_ENCRYPTION_KEY=
CRON_SECRET=
```

## Required for MVP runtime

### NEXT_PUBLIC_APP_URL

Local value:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Production value:

```env
NEXT_PUBLIC_APP_URL=https://your-vercel-domain.vercel.app
```

Used for redirects, auth callbacks, and app links.

### NODE_ENV

Local value:

```env
NODE_ENV=development
```

Vercel sets this automatically in production.

### NEXT_PUBLIC_SUPABASE_URL

Found in Supabase:

```text
Project Settings → API → Project URL
```

Example format:

```env
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijk.supabase.co
```

This is safe to expose to the browser.

### NEXT_PUBLIC_SUPABASE_ANON_KEY

Found in Supabase:

```text
Project Settings → API → Project API keys → anon public
```

This is safe to expose to the browser when Row Level Security is configured correctly.

### SUPABASE_SERVICE_ROLE_KEY

Found in Supabase:

```text
Project Settings → API → Project API keys → service_role
```

Server-only. Never expose in browser code. Never prefix with `NEXT_PUBLIC_`.

Use only in server actions, API routes, background jobs, or admin-only ingestion work.

### SUPABASE_STORAGE_BUCKET

Recommended value:

```env
SUPABASE_STORAGE_BUCKET=financial-uploads
```

Create this bucket in Supabase Storage. It should be private.

Used to store raw uploaded bank, investment, crypto, and debt exports before parsing.

## Migration / ORM values

These are not required for the current Next.js runtime because the app uses Supabase JS clients for database access. They are still useful for migrations, direct database tools, or a future ORM layer.

### DATABASE_URL

Found in Supabase:

```text
Project Settings → Database → Connection string
```

Use the pooled connection string for application queries and Prisma in serverless/Vercel environments.

Typical Prisma/Supabase format:

```env
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@[pooler-host]:6543/postgres?pgbouncer=true&connection_limit=1
```

Keep this server-only.

### DIRECT_URL

Found in Supabase:

```text
Project Settings → Database → Connection string
```

Use the direct connection string for migrations.

Typical format:

```env
DIRECT_URL=postgresql://postgres:[password]@[db-host]:5432/postgres
```

Keep this server-only.

## Optional for later

### OPENAI_API_KEY

Only needed when AI classification and financial assistant features are added.

Get this from the OpenAI dashboard.

Server-only. Never expose in browser code.

### OPENAI_MODEL_CLASSIFICATION

Suggested default:

```env
OPENAI_MODEL_CLASSIFICATION=gpt-5.4-mini
```

Used later for routine transaction classification, merchant cleanup, and category suggestions.

### OPENAI_MODEL_REASONING

Suggested default:

```env
OPENAI_MODEL_REASONING=gpt-5.5
```

Used later for more complex planning, summaries, and scenario explanations.

### APP_ENCRYPTION_KEY

Optional later.

Used if the app encrypts selected sensitive values at the application layer.

Generate a strong random value before using this in production.

### CRON_SECRET

Optional later.

Used to protect scheduled jobs or webhook endpoints.

## Vercel setup checklist

In Vercel:

```text
Project → Settings → Environment Variables
```

Add these runtime values for Production, Preview, and Development where appropriate:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
```

Add these only where you run migrations, direct database tools, or future ORM workflows:

```text
DATABASE_URL
DIRECT_URL
```

Do not add real secrets to `.env.example`.

## Local development checklist

Create a local file named `.env.local`.

Add your real values there.

Do not commit `.env.local`.

Ensure `.gitignore` includes:

```gitignore
.env
.env.local
.env.*.local
```

## Security rules

- Anything prefixed with `NEXT_PUBLIC_` can be visible in the browser.
- Never prefix secrets with `NEXT_PUBLIC_`.
- `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`, and `OPENAI_API_KEY` are server-only.
- Keep the `financial-uploads` bucket private.
- Do not upload real bank exports to GitHub.
- Use Supabase Row Level Security before adding real personal finance data.
