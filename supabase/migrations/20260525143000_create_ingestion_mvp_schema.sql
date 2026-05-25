create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  parent_id uuid references public.transaction_categories(id) on delete set null,
  color text,
  icon text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_categories_name_not_blank check (length(trim(name)) > 0),
  constraint transaction_categories_slug_not_blank check (length(trim(slug)) > 0),
  constraint transaction_categories_system_global check (
    (is_system = false) or (user_id is null)
  )
);

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  institution_name text,
  account_type text not null default 'bank',
  currency char(3) not null default 'ZAR',
  opening_balance numeric(14, 2),
  current_balance numeric(14, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_accounts_name_not_blank check (length(trim(name)) > 0),
  constraint financial_accounts_type_check check (
    account_type in ('bank', 'credit_card', 'investment', 'crypto', 'debt', 'manual')
  ),
  constraint financial_accounts_currency_check check (currency ~ '^[A-Z]{3}$')
);

create table public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.financial_accounts(id) on delete set null,
  storage_bucket text not null default 'financial-uploads',
  storage_path text not null,
  original_filename text not null,
  content_type text,
  file_size_bytes bigint,
  file_sha256 text,
  source_kind text not null default 'bank_export',
  status text not null default 'uploaded',
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uploaded_files_storage_path_not_blank check (length(trim(storage_path)) > 0),
  constraint uploaded_files_original_filename_not_blank check (length(trim(original_filename)) > 0),
  constraint uploaded_files_size_check check (file_size_bytes is null or file_size_bytes >= 0),
  constraint uploaded_files_source_kind_check check (
    source_kind in ('bank_export', 'credit_card_export', 'investment_export', 'crypto_export', 'debt_export', 'manual')
  ),
  constraint uploaded_files_status_check check (
    status in ('uploaded', 'parsing', 'staged', 'committed', 'failed', 'deleted')
  )
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.financial_accounts(id) on delete set null,
  uploaded_file_id uuid references public.uploaded_files(id) on delete set null,
  reprocess_of_batch_id uuid references public.import_batches(id) on delete set null,
  status text not null default 'created',
  source_format text,
  mapping_json jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0,
  staged_rows integer not null default 0,
  approved_rows integer not null default 0,
  committed_rows integer not null default 0,
  skipped_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  error_rows integer not null default 0,
  error_message text,
  started_at timestamptz,
  staged_at timestamptz,
  committed_at timestamptz,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_batches_status_check check (
    status in ('created', 'parsing', 'staged', 'reviewing', 'ready_to_commit', 'committing', 'committed', 'failed', 'undone')
  ),
  constraint import_batches_counts_check check (
    total_rows >= 0
    and staged_rows >= 0
    and approved_rows >= 0
    and committed_rows >= 0
    and skipped_rows >= 0
    and duplicate_rows >= 0
    and error_rows >= 0
  )
);

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_name text not null,
  normalized_key text not null,
  category_id uuid references public.transaction_categories(id) on delete set null,
  website text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint merchants_canonical_name_not_blank check (length(trim(canonical_name)) > 0),
  constraint merchants_normalized_key_not_blank check (length(trim(normalized_key)) > 0)
);

create table public.staged_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  uploaded_file_id uuid references public.uploaded_files(id) on delete set null,
  account_id uuid references public.financial_accounts(id) on delete set null,
  row_number integer not null,
  raw_row jsonb not null default '{}'::jsonb,
  transaction_date date,
  posted_date date,
  description_raw text,
  description_clean text,
  merchant_name text,
  amount numeric(14, 2),
  currency char(3) default 'ZAR',
  direction text,
  category_id uuid references public.transaction_categories(id) on delete set null,
  duplicate_key text,
  duplicate_candidate_transaction_id uuid,
  committed_transaction_id uuid,
  status text not null default 'pending',
  error_code text,
  error_message text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staged_transactions_row_number_check check (row_number > 0),
  constraint staged_transactions_currency_check check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint staged_transactions_direction_check check (
    direction is null or direction in ('income', 'expense', 'transfer')
  ),
  constraint staged_transactions_status_check check (
    status in ('pending', 'needs_review', 'approved', 'duplicate', 'invalid', 'skipped', 'committed')
  ),
  constraint staged_transactions_batch_row_unique unique (import_batch_id, row_number)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.financial_accounts(id) on delete restrict,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  staged_transaction_id uuid references public.staged_transactions(id) on delete set null,
  transaction_date date not null,
  posted_date date,
  description_raw text not null,
  description_clean text,
  merchant_id uuid references public.merchants(id) on delete set null,
  amount numeric(14, 2) not null,
  currency char(3) not null default 'ZAR',
  direction text not null,
  category_id uuid references public.transaction_categories(id) on delete set null,
  is_recurring boolean not null default false,
  is_subscription boolean not null default false,
  is_transfer boolean not null default false,
  is_ad_hoc boolean not null default false,
  confidence_score numeric(4, 3),
  user_verified boolean not null default false,
  duplicate_key text,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_description_raw_not_blank check (length(trim(description_raw)) > 0),
  constraint transactions_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint transactions_direction_check check (direction in ('income', 'expense', 'transfer')),
  constraint transactions_confidence_score_check check (
    confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)
  )
);

alter table public.staged_transactions
  add constraint staged_transactions_duplicate_candidate_fk
  foreign key (duplicate_candidate_transaction_id)
  references public.transactions(id)
  on delete set null;

alter table public.staged_transactions
  add constraint staged_transactions_committed_transaction_fk
  foreign key (committed_transaction_id)
  references public.transactions(id)
  on delete set null;

create table public.transaction_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  match_type text not null,
  pattern text,
  amount_min numeric(14, 2),
  amount_max numeric(14, 2),
  merchant_id uuid references public.merchants(id) on delete set null,
  category_id uuid references public.transaction_categories(id) on delete set null,
  direction text,
  is_subscription boolean,
  is_transfer boolean,
  priority integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_rules_match_type_check check (
    match_type in ('contains', 'regex', 'exact', 'amount_range', 'merchant')
  ),
  constraint transaction_rules_direction_check check (
    direction is null or direction in ('income', 'expense', 'transfer')
  ),
  constraint transaction_rules_amount_range_check check (
    amount_min is null or amount_max is null or amount_min <= amount_max
  )
);

create unique index transaction_categories_global_slug_unique
  on public.transaction_categories (slug)
  where user_id is null;

create unique index transaction_categories_user_slug_unique
  on public.transaction_categories (user_id, slug)
  where user_id is not null;

create unique index uploaded_files_user_storage_path_unique
  on public.uploaded_files (user_id, storage_path);

create unique index merchants_user_normalized_key_unique
  on public.merchants (user_id, normalized_key);

create unique index transactions_user_duplicate_key_active_unique
  on public.transactions (user_id, duplicate_key)
  where duplicate_key is not null and deleted_at is null;

create index profiles_email_idx on public.profiles (email);
create index financial_accounts_user_id_idx on public.financial_accounts (user_id);
create index uploaded_files_user_id_idx on public.uploaded_files (user_id);
create index uploaded_files_account_id_idx on public.uploaded_files (account_id);
create index uploaded_files_file_sha256_idx on public.uploaded_files (file_sha256);
create index import_batches_user_id_idx on public.import_batches (user_id);
create index import_batches_account_id_idx on public.import_batches (account_id);
create index import_batches_uploaded_file_id_idx on public.import_batches (uploaded_file_id);
create index import_batches_reprocess_of_batch_id_idx on public.import_batches (reprocess_of_batch_id);
create index staged_transactions_user_id_idx on public.staged_transactions (user_id);
create index staged_transactions_account_id_idx on public.staged_transactions (account_id);
create index staged_transactions_import_batch_id_idx on public.staged_transactions (import_batch_id);
create index staged_transactions_duplicate_key_idx on public.staged_transactions (duplicate_key);
create index staged_transactions_status_idx on public.staged_transactions (status);
create index transactions_user_id_idx on public.transactions (user_id);
create index transactions_account_id_idx on public.transactions (account_id);
create index transactions_import_batch_id_idx on public.transactions (import_batch_id);
create index transactions_transaction_date_idx on public.transactions (transaction_date);
create index transactions_user_account_date_idx on public.transactions (user_id, account_id, transaction_date);
create index transactions_duplicate_lookup_idx
  on public.transactions (user_id, account_id, transaction_date, amount, duplicate_key)
  where deleted_at is null;
create index transactions_description_raw_trgm_idx
  on public.transactions using gin (description_raw gin_trgm_ops);
create index transactions_description_clean_trgm_idx
  on public.transactions using gin (description_clean gin_trgm_ops);
create index merchants_user_id_idx on public.merchants (user_id);
create index merchants_canonical_name_trgm_idx
  on public.merchants using gin (canonical_name gin_trgm_ops);
create index transaction_rules_user_id_idx on public.transaction_rules (user_id);
create index transaction_rules_merchant_id_idx on public.transaction_rules (merchant_id);
create index transaction_rules_category_id_idx on public.transaction_rules (category_id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger transaction_categories_set_updated_at
before update on public.transaction_categories
for each row execute function public.set_updated_at();

create trigger financial_accounts_set_updated_at
before update on public.financial_accounts
for each row execute function public.set_updated_at();

create trigger uploaded_files_set_updated_at
before update on public.uploaded_files
for each row execute function public.set_updated_at();

create trigger import_batches_set_updated_at
before update on public.import_batches
for each row execute function public.set_updated_at();

create trigger merchants_set_updated_at
before update on public.merchants
for each row execute function public.set_updated_at();

create trigger staged_transactions_set_updated_at
before update on public.staged_transactions
for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create trigger transaction_rules_set_updated_at
before update on public.transaction_rules
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.transaction_categories enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.uploaded_files enable row level security;
alter table public.import_batches enable row level security;
alter table public.merchants enable row level security;
alter table public.staged_transactions enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_rules enable row level security;

create or replace function public.is_readable_transaction_category(_category_id uuid)
returns boolean
language sql
stable
as $$
  select _category_id is null
    or exists (
      select 1
      from public.transaction_categories
      where id = _category_id
        and auth.uid() is not null
        and (user_id is null or user_id = auth.uid())
    );
$$;

create or replace function public.is_own_financial_account(_account_id uuid)
returns boolean
language sql
stable
as $$
  select _account_id is null
    or exists (
      select 1
      from public.financial_accounts
      where id = _account_id
        and user_id = auth.uid()
    );
$$;

create or replace function public.is_own_uploaded_file(_uploaded_file_id uuid)
returns boolean
language sql
stable
as $$
  select _uploaded_file_id is null
    or exists (
      select 1
      from public.uploaded_files
      where id = _uploaded_file_id
        and user_id = auth.uid()
    );
$$;

create or replace function public.is_own_import_batch(_import_batch_id uuid)
returns boolean
language sql
stable
as $$
  select _import_batch_id is null
    or exists (
      select 1
      from public.import_batches
      where id = _import_batch_id
        and user_id = auth.uid()
    );
$$;

create or replace function public.is_own_merchant(_merchant_id uuid)
returns boolean
language sql
stable
as $$
  select _merchant_id is null
    or exists (
      select 1
      from public.merchants
      where id = _merchant_id
        and user_id = auth.uid()
    );
$$;

create or replace function public.is_own_staged_transaction(_staged_transaction_id uuid)
returns boolean
language sql
stable
as $$
  select _staged_transaction_id is null
    or exists (
      select 1
      from public.staged_transactions
      where id = _staged_transaction_id
        and user_id = auth.uid()
    );
$$;

create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = id);

create policy "profiles_insert_own"
on public.profiles for insert
with check (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "transaction_categories_select_global_or_own"
on public.transaction_categories for select
using (auth.uid() is not null and (user_id is null or auth.uid() = user_id));

create policy "transaction_categories_insert_own"
on public.transaction_categories for insert
with check (auth.uid() = user_id and is_system = false);

create policy "transaction_categories_update_own"
on public.transaction_categories for update
using (auth.uid() = user_id and is_system = false)
with check (auth.uid() = user_id and is_system = false);

create policy "transaction_categories_delete_own"
on public.transaction_categories for delete
using (auth.uid() = user_id and is_system = false);

create policy "financial_accounts_select_own"
on public.financial_accounts for select
using (auth.uid() = user_id);

create policy "financial_accounts_insert_own"
on public.financial_accounts for insert
with check (auth.uid() = user_id);

create policy "financial_accounts_update_own"
on public.financial_accounts for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "financial_accounts_delete_own"
on public.financial_accounts for delete
using (auth.uid() = user_id);

create policy "uploaded_files_select_own"
on public.uploaded_files for select
using (auth.uid() = user_id);

create policy "uploaded_files_insert_own"
on public.uploaded_files for insert
with check (
  auth.uid() = user_id
  and public.is_own_financial_account(account_id)
);

create policy "uploaded_files_update_own"
on public.uploaded_files for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and public.is_own_financial_account(account_id)
);

create policy "uploaded_files_delete_own"
on public.uploaded_files for delete
using (auth.uid() = user_id);

create policy "import_batches_select_own"
on public.import_batches for select
using (auth.uid() = user_id);

create policy "import_batches_insert_own"
on public.import_batches for insert
with check (
  auth.uid() = user_id
  and public.is_own_financial_account(account_id)
  and public.is_own_uploaded_file(uploaded_file_id)
  and public.is_own_import_batch(reprocess_of_batch_id)
);

create policy "import_batches_update_own"
on public.import_batches for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and public.is_own_financial_account(account_id)
  and public.is_own_uploaded_file(uploaded_file_id)
  and public.is_own_import_batch(reprocess_of_batch_id)
);

create policy "import_batches_delete_own"
on public.import_batches for delete
using (auth.uid() = user_id);

create policy "merchants_select_own"
on public.merchants for select
using (auth.uid() = user_id);

create policy "merchants_insert_own"
on public.merchants for insert
with check (
  auth.uid() = user_id
  and public.is_readable_transaction_category(category_id)
);

create policy "merchants_update_own"
on public.merchants for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and public.is_readable_transaction_category(category_id)
);

create policy "merchants_delete_own"
on public.merchants for delete
using (auth.uid() = user_id);

create policy "staged_transactions_select_own"
on public.staged_transactions for select
using (auth.uid() = user_id);

create policy "staged_transactions_insert_own"
on public.staged_transactions for insert
with check (
  auth.uid() = user_id
  and public.is_own_import_batch(import_batch_id)
  and public.is_own_uploaded_file(uploaded_file_id)
  and public.is_own_financial_account(account_id)
  and public.is_readable_transaction_category(category_id)
);

create policy "staged_transactions_update_own"
on public.staged_transactions for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and public.is_own_import_batch(import_batch_id)
  and public.is_own_uploaded_file(uploaded_file_id)
  and public.is_own_financial_account(account_id)
  and public.is_readable_transaction_category(category_id)
);

create policy "staged_transactions_delete_own"
on public.staged_transactions for delete
using (auth.uid() = user_id);

create policy "transactions_select_own"
on public.transactions for select
using (auth.uid() = user_id);

create policy "transactions_insert_own"
on public.transactions for insert
with check (
  auth.uid() = user_id
  and public.is_own_financial_account(account_id)
  and public.is_own_import_batch(import_batch_id)
  and public.is_own_staged_transaction(staged_transaction_id)
  and public.is_own_merchant(merchant_id)
  and public.is_readable_transaction_category(category_id)
);

create policy "transactions_update_own"
on public.transactions for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and public.is_own_financial_account(account_id)
  and public.is_own_import_batch(import_batch_id)
  and public.is_own_staged_transaction(staged_transaction_id)
  and public.is_own_merchant(merchant_id)
  and public.is_readable_transaction_category(category_id)
);

create policy "transactions_delete_own"
on public.transactions for delete
using (auth.uid() = user_id);

create policy "transaction_rules_select_own"
on public.transaction_rules for select
using (auth.uid() = user_id);

create policy "transaction_rules_insert_own"
on public.transaction_rules for insert
with check (
  auth.uid() = user_id
  and public.is_own_merchant(merchant_id)
  and public.is_readable_transaction_category(category_id)
);

create policy "transaction_rules_update_own"
on public.transaction_rules for update
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and public.is_own_merchant(merchant_id)
  and public.is_readable_transaction_category(category_id)
);

create policy "transaction_rules_delete_own"
on public.transaction_rules for delete
using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
