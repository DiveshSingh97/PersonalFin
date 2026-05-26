# Import Ingestion Specification

Status: Draft v1  
Repository: `DiveshSingh97/PersonalFin`  
Scope: Ingestion MVP data model and import workflow  
Last updated: 2026-05-25

## 1. Purpose

PersonalFin is database-first. Uploaded files are temporary input sources, while normalized database records are the durable source of truth.

This specification defines the ingestion MVP for user-uploaded financial exports. It covers raw file storage, import batches, staged review, normalized transactions, duplicate detection, undo, reprocessing, and acceptance criteria.

This document does not define upload UI, CSV/XLSX parser implementation, AI classification, or database access code.

## 2. Migration Approach

Use Supabase SQL migrations first.

Supabase SQL migrations are the right first choice because:

- The project is already Supabase-first for Auth, Postgres, and Storage.
- SQL migrations can be applied directly with the Supabase CLI or SQL editor.
- Row Level Security policies are easier to review in SQL.
- No Prisma schema or app-side ORM layer exists yet.
- The ingestion schema should stay close to Supabase Postgres behavior while the MVP is still forming.

Prisma can be revisited later if the application needs generated TypeScript query types or ORM-managed migrations.

## 3. Upload Flow

MVP upload flow:

1. User chooses a financial account.
2. User uploads a CSV or XLSX export.
3. App stores the raw file in the private `financial-uploads` Supabase Storage bucket.
4. App creates an `uploaded_files` record for storage metadata.
5. App creates an `import_batches` record for that upload.
6. Parser reads the raw file and writes parsed rows to `staged_transactions`.
7. User reviews staged rows, column mappings, duplicates, errors, and uncertain rows.
8. User confirms the import.
9. Approved staged rows are inserted into `transactions`.
10. Import batch is marked `committed`.

Raw files must never be treated as the working source of truth after import.

## 4. Raw File Storage Rules

Raw files are stored in Supabase Storage, not in Postgres.

Rules:

- Use the private bucket named `financial-uploads`.
- Do not commit raw financial exports to GitHub.
- Store bucket name, object path, original filename, file size, MIME type, and checksum in `uploaded_files`.
- The recommended object path format is:

```text
{user_id}/{uploaded_file_id}/{safe_original_filename}
```

- Raw files should be readable only by the owning user or trusted server-side ingestion code.
- A raw file may be retained for auditability, reprocessing, and import undo/review.
- If the user deletes their data, raw files and metadata must be deleted together.

This PR documents storage rules only. It does not create the Supabase Storage bucket or storage policies.

## 5. Import Batch Lifecycle

Every upload creates exactly one initial import batch.

Batch statuses:

- `created`: batch record exists but parsing has not started.
- `parsing`: parser is reading the raw file.
- `staged`: rows have been written to staging.
- `reviewing`: user is reviewing mappings, errors, and duplicates.
- `ready_to_commit`: all required rows are approved, skipped, or fixed.
- `committing`: approved rows are being inserted into normalized transactions.
- `committed`: approved rows were committed.
- `failed`: batch-level failure blocked progress.
- `undone`: committed transactions from this batch were soft-deleted.

Required behavior:

- Every staged row references an import batch.
- Every normalized transaction created from import references the import batch.
- Row counts and error counts are tracked on the batch.
- A committed batch can be undone.
- A batch can be reprocessed by creating a new batch linked to the original with `reprocess_of_batch_id`.

## 6. Staging Table Purpose

`staged_transactions` is the review buffer between raw files and normalized transactions.

It stores:

- raw row JSON
- source row number
- mapped transaction fields
- parse or validation errors
- duplicate candidates
- review status
- committed transaction reference after import

Rows should stay in staging until the user approves, fixes, skips, or rejects them.

Staging protects normalized records from bad parser assumptions and allows the user to correct mappings before data becomes official.

## 7. Normalized Transaction Table Purpose

`transactions` is the durable transaction ledger for PersonalFin.

It stores clean, queryable records after review and commit:

- account
- transaction and posted dates
- raw and cleaned descriptions
- amount, currency, and direction
- merchant and category references
- recurring/subscription/transfer flags
- import batch reference
- duplicate key
- soft delete timestamp for undo

Application features should read from normalized transactions, not directly from staged rows or raw files.

## 8. Column Mapping Rules

Column mappings translate source export columns into PersonalFin fields.

MVP required mapped fields:

- transaction date
- description
- amount

Recommended mapped fields:

- posted date
- currency
- debit amount
- credit amount
- balance
- reference

Rules:

- Saved mappings should be tied to account/provider patterns later.
- Rows missing required fields are marked `invalid`.
- Debit/credit exports must be normalized into signed `amount` and `direction`.
- Unknown category defaults to the seeded `Unknown` category.
- Mapping changes should be re-runnable against staged rows before commit.

## 9. Duplicate Detection Rules

Duplicate detection is deterministic.

The MVP duplicate key should be derived from:

```text
user_id
account_id
transaction_date
amount
normalized description
```

Rules:

- Whitespace and casing differences should not create different duplicate keys.
- Duplicate checks only compare against active transactions where `deleted_at is null`.
- A staged row with a matching duplicate key is marked `duplicate`.
- Duplicate candidates should reference the matched transaction when possible.
- The user may skip duplicates or explicitly approve a duplicate if needed.
- The database enforces one active transaction per duplicate key per user.

## 10. Undo Import Rules

Undoing an import batch must not delete audit history.

Rules:

- Only committed batches can be undone.
- Undo sets `transactions.deleted_at` for transactions from that batch.
- Undo sets `import_batches.status = 'undone'` and `undone_at`.
- Staged rows remain available for audit and possible reprocessing.
- Duplicate detection ignores undone transactions because they have `deleted_at` set.
- Undo should be all-or-nothing in a database transaction when implemented.

## 11. Confirm Import Rules

Confirming an import batch should be database-atomic.

Rules:

- Confirm is performed by the Supabase Postgres RPC `confirm_import_batch`.
- The RPC uses the authenticated user identity and only mutates records owned by that user.
- The RPC locks the target import batch before processing so repeated confirm attempts cannot interleave.
- Only staged rows with status `approved` are eligible for insertion into `transactions`.
- Rows with status `invalid`, `duplicate`, `skipped`, `needs_review`, or `committed` are not inserted.
- Approved rows missing required normalized fields are marked `invalid` inside the transaction before insert.
- Approved rows whose duplicate key already exists on an active transaction are marked `duplicate` and skipped.
- Approved rows inserted successfully are marked `committed` and linked to the created transaction.
- Batch row counts and `committed_at` are updated in the same transaction as transaction insertion.
- Re-running confirm on an already committed batch must not create duplicate transactions.

Undo remains separate and soft-removes committed transactions by setting `deleted_at`.

## 12. Reprocess Import Rules

Reprocessing creates a new import batch instead of mutating the original batch.

Rules:

- The new batch references the original in `reprocess_of_batch_id`.
- Reprocessing may use the same `uploaded_file_id`.
- Original staged rows and errors remain unchanged.
- If the original was committed, the user should undo it before committing the reprocessed batch unless the app can prove no duplicate normalized records will be created.

## 13. Error Handling

Batch-level errors belong on `import_batches`.

Examples:

- unsupported file type
- unreadable file
- parser crash
- missing account
- storage object missing

Row-level errors belong on `staged_transactions`.

Examples:

- missing date
- invalid amount
- empty description
- unknown debit/credit format
- duplicate detected

Rows with errors should remain reviewable. Errors should not expose secrets or raw financial data in browser logs.

## 14. Review Workflow

The review workflow should let the user:

- inspect parsed rows before commit
- fix mapped values
- choose categories
- confirm or skip duplicate rows
- skip invalid rows
- approve valid rows
- commit approved rows
- adjust column mapping before commit and reprocess staged rows without creating a new raw upload
- bulk mark staged rows as approved, skipped, or needs review

Staged row statuses:

- `pending`
- `needs_review`
- `approved`
- `duplicate`
- `invalid`
- `skipped`
- `committed`

Only `approved` rows should be inserted into `transactions`.

Review edits are staging-only. Updating a staged row or changing column mapping must not mutate `transactions`; final records are only created through the confirm-import action. If a batch is already committed, remapping should be disabled unless a future workflow can safely undo and reprocess the batch.

## 15. MVP Acceptance Criteria

The ingestion MVP schema is acceptable when:

- SQL migrations create all required ingestion tables.
- Row Level Security is enabled on all user-owned tables.
- Users can only read and mutate their own records.
- Global default categories are readable by all authenticated users.
- Default categories are seeded idempotently.
- Upload metadata, import batches, staged rows, and normalized transactions are linked.
- Duplicate detection fields and indexes exist.
- Undo can be implemented by soft-deleting transactions for an import batch.
- Reprocessing can be represented without overwriting original batch history.
- Placeholder app pages still build without upload UI, parsing, database access code, or AI features.

## 16. Transaction Cleanup Rules

After import confirmation, raw transaction descriptions should be transformed into cleaner financial data without losing auditability.

Merchant normalization is deterministic in the MVP:

- Raw descriptions remain stored in `transactions.description_raw`.
- Cleaned descriptions may be shown beside raw descriptions for review.
- Obvious bank export prefixes, masked card suffixes, and repeated card/account tokens can be removed for display.
- Known merchant patterns can produce a canonical display name and normalized merchant key.
- The normalized merchant key should be stable enough to reuse across imports, rules, and future dashboards.
- No AI or external merchant API is used for merchant normalization in this stage.

Category editing is user-controlled:

- Users can assign an existing global or user-owned category to an active transaction.
- Users can clear a category to leave a transaction uncategorized.
- Category edits must only affect the signed-in user's transactions.
- Deleted transactions where `deleted_at is not null` must not be mutated by cleanup actions.

Transaction rules are reusable deterministic cleanup instructions:

- Rules belong to one user.
- Initial rule matching supports simple `contains` and `exact` patterns.
- A rule may optionally be scoped to a transaction direction.
- A rule may set `category_id`, `is_subscription`, and `is_transfer`.
- Active rules are evaluated by ascending priority, then creation order.
- Rule application should be available for one transaction and for all active uncategorized transactions.
- Rule application must not directly create new financial transactions.

Limitations:

- Deterministic matching will miss ambiguous merchants and unusual bank descriptions.
- Regex, AI categorization, recurring detection, and background rule jobs are later enhancements.
- Users should be able to review and correct rule results before dashboards rely on them heavily.
