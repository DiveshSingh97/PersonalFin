alter table public.financial_accounts
  add column if not exists account_role text,
  add column if not exists parent_account_id uuid references public.financial_accounts(id) on delete set null,
  add column if not exists include_in_cash_flow boolean not null default true,
  add column if not exists include_in_net_worth boolean not null default true;

update public.financial_accounts
set account_role = case
  when account_role is not null then account_role
  when account_type = 'credit_card' then 'credit_card'
  when account_type = 'investment' then 'investment'
  when account_type = 'crypto' then 'crypto'
  when account_type = 'debt' then 'debt'
  when account_type = 'manual' then 'manual'
  else 'primary_bank_account'
end
where account_role is null;

alter table public.financial_accounts
  drop constraint if exists financial_accounts_role_check,
  add constraint financial_accounts_role_check check (
    account_role is null or account_role in (
      'primary_bank_account',
      'secondary_bank_account',
      'credit_card',
      'savings',
      'investment',
      'crypto',
      'retirement',
      'debt',
      'manual'
    )
  );

create index if not exists financial_accounts_provider_idx
  on public.financial_accounts (user_id, institution_name);

create index if not exists financial_accounts_role_idx
  on public.financial_accounts (user_id, account_role);

create index if not exists financial_accounts_parent_account_idx
  on public.financial_accounts (user_id, parent_account_id);
