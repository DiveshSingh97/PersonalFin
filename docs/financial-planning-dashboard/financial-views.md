# Financial Views

Status: Draft v1  
Repository: `DiveshSingh97/PersonalFin`  
Scope: Bank-first account metadata and dynamic financial scopes

## Purpose

PersonalFin needs to answer questions at different account scopes before AI chat, subscriptions, or planning can be useful.

The first real setup is bank-first:

- a primary bank account
- a secondary bank account
- credit cards linked to one of those banks
- later investment, retirement, crypto, debt, and manual accounts

Financial views let the app summarize the same normalized transactions as total, bank-only, credit-card-only, provider-specific, or account-specific views.

## Account Metadata

`financial_accounts` stores the metadata needed for these views:

- `institution_name`: provider name, such as FNB or Discovery.
- `account_type`: broad account type, such as `bank`, `credit_card`, `investment`, `crypto`, `debt`, or `manual`.
- `account_role`: user-facing role, such as `primary_bank_account`, `secondary_bank_account`, `credit_card`, `savings`, `investment`, `crypto`, `retirement`, `debt`, or `manual`.
- `parent_account_id`: optional link from a credit card or child account to a parent bank/provider account.
- `include_in_cash_flow`: whether the account should usually be included in cash-flow views.
- `include_in_net_worth`: whether the account should usually be included in future net-worth views.

Existing accounts remain valid. A migration backfills `account_role` from `account_type`.

## Dynamic Scopes

The first implementation derives scopes from existing active accounts. It does not create a saved custom views table yet.

Supported scopes include:

- Total
- Bank accounts
- Credit cards
- Investments
- Crypto
- Debt
- Provider including linked credit cards
- Provider excluding credit cards
- Provider credit cards only
- Specific account

Provider scopes are based on `institution_name`. Linked credit-card scopes also include credit cards whose `parent_account_id` points to a provider account.

## Dashboard And Transactions

`/dashboard` and `/transactions` both expose a view selector powered by the same deterministic scope helper.

Dashboard summaries, cash flow, category spend, top merchants, recent transactions, and data-health sections respect the selected scope.

Transactions can use the same scope selector and still optionally narrow to one specific account for cleanup work.

## Limitations

- Scopes are dynamic, not saved custom views.
- The app does not yet provide account editing; new metadata is captured on account creation.
- Net worth, investments, crypto, debt, forecasting, and AI summaries are later layers.
