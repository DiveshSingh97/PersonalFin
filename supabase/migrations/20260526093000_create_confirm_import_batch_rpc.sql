create or replace function public.confirm_import_batch(p_import_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_batch public.import_batches%rowtype;
  v_now timestamptz := now();
  v_inserted_rows integer := 0;
  v_invalid_approved_rows integer := 0;
  v_duplicate_approved_rows integer := 0;
  v_race_duplicate_rows integer := 0;
  v_total_rows integer := 0;
  v_approved_rows integer := 0;
  v_committed_rows integer := 0;
  v_skipped_rows integer := 0;
  v_duplicate_rows integer := 0;
  v_invalid_rows integer := 0;
  v_needs_review_rows integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required to confirm import batch'
      using errcode = '42501';
  end if;

  select *
  into v_batch
  from public.import_batches
  where id = p_import_batch_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Import batch not found'
      using errcode = 'P0002';
  end if;

  if v_batch.status = 'undone' then
    raise exception 'Cannot confirm an undone import batch'
      using errcode = 'P0001';
  end if;

  if v_batch.status = 'committed' then
    select
      count(*)::integer,
      count(*) filter (where status = 'approved')::integer,
      count(*) filter (where status = 'committed')::integer,
      count(*) filter (where status = 'skipped')::integer,
      count(*) filter (where status = 'duplicate')::integer,
      count(*) filter (where status = 'invalid')::integer,
      count(*) filter (where status = 'needs_review')::integer
    into
      v_total_rows,
      v_approved_rows,
      v_committed_rows,
      v_skipped_rows,
      v_duplicate_rows,
      v_invalid_rows,
      v_needs_review_rows
    from public.staged_transactions
    where import_batch_id = p_import_batch_id
      and user_id = v_user_id;

    return jsonb_build_object(
      'status', 'already_committed',
      'import_batch_id', p_import_batch_id,
      'inserted_rows', 0,
      'committed_rows', v_committed_rows,
      'approved_rows', v_approved_rows,
      'skipped_rows', v_skipped_rows,
      'duplicate_rows', v_duplicate_rows,
      'invalid_rows', v_invalid_rows,
      'needs_review_rows', v_needs_review_rows,
      'total_rows', v_total_rows
    );
  end if;

  update public.import_batches
  set status = 'committing',
      error_message = null
  where id = p_import_batch_id
    and user_id = v_user_id;

  update public.staged_transactions
  set status = 'invalid',
      error_code = 'validation_error',
      error_message = concat_ws(
        '; ',
        case when account_id is null then 'Missing account' end,
        case when transaction_date is null then 'Missing or invalid transaction date' end,
        case when description_raw is null or length(trim(description_raw)) = 0 then 'Missing description' end,
        case when amount is null then 'Missing or invalid amount' end,
        case when currency is null or currency !~ '^[A-Z]{3}$' then 'Missing or invalid currency' end,
        case when direction is null or direction not in ('income', 'expense', 'transfer') then 'Missing or invalid direction' end
      ),
      reviewed_at = v_now
  where import_batch_id = p_import_batch_id
    and user_id = v_user_id
    and status = 'approved'
    and (
      account_id is null
      or transaction_date is null
      or description_raw is null
      or length(trim(description_raw)) = 0
      or amount is null
      or currency is null
      or currency !~ '^[A-Z]{3}$'
      or direction is null
      or direction not in ('income', 'expense', 'transfer')
    );

  get diagnostics v_invalid_approved_rows = row_count;

  with approved_rows as (
    select
      s.id,
      s.duplicate_key,
      row_number() over (
        partition by s.duplicate_key
        order by s.row_number, s.id
      ) as duplicate_rank,
      existing_transaction.id as existing_transaction_id
    from public.staged_transactions s
    left join lateral (
      select t.id
      from public.transactions t
      where t.user_id = v_user_id
        and t.duplicate_key = s.duplicate_key
        and t.deleted_at is null
      order by t.created_at, t.id
      limit 1
    ) existing_transaction on s.duplicate_key is not null
    where s.import_batch_id = p_import_batch_id
      and s.user_id = v_user_id
      and s.status = 'approved'
      and s.committed_transaction_id is null
      and not exists (
        select 1
        from public.transactions committed_transaction
        where committed_transaction.user_id = v_user_id
          and committed_transaction.staged_transaction_id = s.id
          and committed_transaction.deleted_at is null
      )
  ),
  duplicate_rows as (
    select *
    from approved_rows
    where duplicate_key is not null
      and (duplicate_rank > 1 or existing_transaction_id is not null)
  )
  update public.staged_transactions s
  set status = 'duplicate',
      duplicate_candidate_transaction_id = coalesce(
        duplicate_rows.existing_transaction_id,
        s.duplicate_candidate_transaction_id
      ),
      error_code = case
        when duplicate_rows.existing_transaction_id is not null
          then 'duplicate_existing_transaction'
        else 'duplicate_in_batch'
      end,
      error_message = case
        when duplicate_rows.existing_transaction_id is not null
          then 'Duplicate candidate already exists'
        else 'Duplicate candidate within this import'
      end,
      reviewed_at = v_now
  from duplicate_rows
  where s.id = duplicate_rows.id;

  get diagnostics v_duplicate_approved_rows = row_count;

  with inserted_transactions as (
    insert into public.transactions (
      user_id,
      account_id,
      import_batch_id,
      staged_transaction_id,
      transaction_date,
      posted_date,
      description_raw,
      description_clean,
      amount,
      currency,
      direction,
      category_id,
      duplicate_key,
      user_verified
    )
    select
      s.user_id,
      s.account_id,
      s.import_batch_id,
      s.id,
      s.transaction_date,
      s.posted_date,
      s.description_raw,
      s.description_clean,
      s.amount,
      coalesce(s.currency, 'ZAR'),
      s.direction,
      s.category_id,
      s.duplicate_key,
      true
    from public.staged_transactions s
    where s.import_batch_id = p_import_batch_id
      and s.user_id = v_user_id
      and s.status = 'approved'
      and s.committed_transaction_id is null
      and not exists (
        select 1
        from public.transactions committed_transaction
        where committed_transaction.user_id = v_user_id
          and committed_transaction.staged_transaction_id = s.id
          and committed_transaction.deleted_at is null
      )
      and (
        s.duplicate_key is null
        or not exists (
          select 1
          from public.transactions duplicate_transaction
          where duplicate_transaction.user_id = v_user_id
            and duplicate_transaction.duplicate_key = s.duplicate_key
            and duplicate_transaction.deleted_at is null
        )
      )
    on conflict do nothing
    returning id, staged_transaction_id
  )
  update public.staged_transactions s
  set status = 'committed',
      committed_transaction_id = inserted_transactions.id,
      reviewed_at = v_now
  from inserted_transactions
  where s.id = inserted_transactions.staged_transaction_id
    and s.user_id = v_user_id;

  get diagnostics v_inserted_rows = row_count;

  update public.staged_transactions s
  set status = 'duplicate',
      duplicate_candidate_transaction_id = coalesce(
        (
          select t.id
          from public.transactions t
          where t.user_id = v_user_id
            and t.duplicate_key = s.duplicate_key
            and t.deleted_at is null
          order by t.created_at, t.id
          limit 1
        ),
        s.duplicate_candidate_transaction_id
      ),
      error_code = 'duplicate_existing_transaction',
      error_message = 'Duplicate candidate already exists',
      reviewed_at = v_now
  where s.import_batch_id = p_import_batch_id
    and s.user_id = v_user_id
    and s.status = 'approved'
    and s.duplicate_key is not null
    and exists (
      select 1
      from public.transactions t
      where t.user_id = v_user_id
        and t.duplicate_key = s.duplicate_key
        and t.deleted_at is null
    );

  get diagnostics v_race_duplicate_rows = row_count;

  select
    count(*)::integer,
    count(*) filter (where status = 'approved')::integer,
    count(*) filter (where status = 'committed')::integer,
    count(*) filter (where status = 'skipped')::integer,
    count(*) filter (where status = 'duplicate')::integer,
    count(*) filter (where status = 'invalid')::integer,
    count(*) filter (where status = 'needs_review')::integer
  into
    v_total_rows,
    v_approved_rows,
    v_committed_rows,
    v_skipped_rows,
    v_duplicate_rows,
    v_invalid_rows,
    v_needs_review_rows
  from public.staged_transactions
  where import_batch_id = p_import_batch_id
    and user_id = v_user_id;

  update public.import_batches
  set status = 'committed',
      total_rows = v_total_rows,
      staged_rows = v_total_rows,
      approved_rows = v_approved_rows,
      committed_rows = v_committed_rows,
      skipped_rows = v_skipped_rows,
      duplicate_rows = v_duplicate_rows,
      error_rows = v_invalid_rows + v_needs_review_rows,
      committed_at = coalesce(committed_at, v_now),
      error_message = null
  where id = p_import_batch_id
    and user_id = v_user_id;

  if v_batch.uploaded_file_id is not null then
    update public.uploaded_files
    set status = 'committed'
    where id = v_batch.uploaded_file_id
      and user_id = v_user_id;
  end if;

  return jsonb_build_object(
    'status', 'committed',
    'import_batch_id', p_import_batch_id,
    'inserted_rows', v_inserted_rows,
    'invalid_approved_rows', v_invalid_approved_rows,
    'duplicate_approved_rows', v_duplicate_approved_rows + v_race_duplicate_rows,
    'committed_rows', v_committed_rows,
    'approved_rows', v_approved_rows,
    'skipped_rows', v_skipped_rows,
    'duplicate_rows', v_duplicate_rows,
    'invalid_rows', v_invalid_rows,
    'needs_review_rows', v_needs_review_rows,
    'total_rows', v_total_rows
  );
end;
$$;

revoke all on function public.confirm_import_batch(uuid) from public;
grant execute on function public.confirm_import_batch(uuid) to authenticated;
