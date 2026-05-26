# Dashboard MVP

Status: Draft v1  
Repository: `DiveshSingh97/PersonalFin`  
Scope: First committed-transaction dashboard layer

## Purpose

The dashboard turns committed, active transactions into a practical monthly overview.

It is intentionally deterministic and read-only. It does not use AI, forecasts, subscription detection, investment planning, or staged import rows.

## Data Rules

- Include only `transactions` where `deleted_at is null`.
- Exclude staged, uncommitted, duplicate, skipped, invalid, and undone import rows.
- Filter by selected month and optional account.
- Default to the current month when current-month transactions exist.
- If the current month has no transactions, default to the most recent transaction month.
- Treat `Unknown` and empty category values as uncategorized for dashboard cleanup counts.

## Sections

The first dashboard includes:

- Summary cards for income, expenses, net cash flow, transaction count, uncategorized count, and active account count.
- A month-by-month cash flow table for the selected month and previous 11 months.
- Expense spending by category, sorted by largest spend.
- Top merchants by expense amount, using normalized merchant names where available.
- Recent active transactions for quick inspection.
- Import and data-health summary with latest import batches and cleanup links.

## Limitations

- No charting library is used yet.
- Rule application is separate from dashboard loading.
- Subscription, recurring payment, forecast, simulation, and AI insight layers are future work.
