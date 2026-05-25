# AI Financial Planning Dashboard — Master Architecture

Status: Draft v1  
Repository: `DiveshSingh97/PersonalFin`  
Primary planning location: `docs/financial-planning-dashboard/`  
Last updated: 2026-05-25

## 1. Product Vision

Build a private AI financial planning dashboard that becomes a central operating system for personal finances.

The platform should let the user:

- Upload exports from multiple bank accounts, investment providers, crypto platforms, and debt providers.
- Normalize those exports into a durable master financial database.
- Search and analyze common transactions.
- Identify subscriptions and recurring payments.
- Detect ad hoc or unknown payments and ask the user to classify them.
- Simulate moving monthly expenses into savings, debt repayment, or investments.
- Model debt payoff strategies.
- Model investment growth over different time horizons and rates.
- Track net worth, assets, liabilities, investments, crypto, cash, and debt.
- Use AI to explain patterns, classify ambiguous data, and recommend next actions.

The system must avoid becoming a collection of temporary spreadsheets. The master database is the source of truth.

## 2. Core Principle

The product is database-first, not spreadsheet-first.

All uploaded files are temporary input sources. Once processed, their data must be normalized into internal tables.

```text
Bank exports / investment exports / crypto exports / debt exports
        ↓
Upload and import pipeline
        ↓
Normalization layer
        ↓
Master financial database
        ↓
Rules engine + deterministic calculations + AI workflows
        ↓
Dashboard, simulations, insights, and assistant
```

## 3. Goals

### 3.1 MVP Goals

- Upload CSV/XLSX bank exports.
- Store all transactions in PostgreSQL.
- Detect duplicate transactions.
- Categorize transactions.
- Identify recurring payments and subscriptions.
- Allow manual corrections.
- Remember user correction rules.
- Show monthly cash flow, expenses, savings rate, and category breakdowns.
- Provide a basic scenario simulator.
- Store simulation scenarios.

### 3.2 Full Product Goals

- Multi-bank account support.
- Investment account tracking.
- Crypto holding tracking.
- Debt repayment planning.
- Subscription optimization.
- Net worth tracking.
- AI financial assistant.
- Anomaly detection.
- Monthly reports.
- Long-term investment projections.
- Debt versus investment prioritization.

## 4. Non-Goals

For the first version, do not build:

- Live bank API integration.
- Automated trading.
- Tax filing.
- Regulated financial advice.
- Complex portfolio optimization.
- Real-time market execution.

The first version should focus on user-uploaded exports and deterministic planning.

## 5. Suggested Tech Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Recharts or Tremor for charts

### Backend

- Next.js API routes or FastAPI
- PostgreSQL
- Prisma or SQLAlchemy
- Background job queue for imports if needed

### Storage

- S3-compatible object storage for raw uploads
- Examples: AWS S3, Cloudflare R2, Supabase Storage

### Auth

- Clerk, Supabase Auth, or Auth.js

### AI

- OpenAI API
- Structured JSON outputs for classification and analysis
- Smaller model for routine classification
- Stronger reasoning model for planning, explanations, and scenario interpretation

## 6. System Modules

1. Upload Center
2. Accounts
3. Transactions
4. Merchants
5. Categories
6. Rules Engine
7. Subscriptions
8. Ad Hoc Payments
9. Monthly Dashboard
10. Scenario Simulator
11. Debt Planner
12. Investment Planner
13. Crypto Tracker
14. Net Worth Tracker
15. AI Financial Assistant
16. Reports
17. Settings and Data Management

## 7. Data Ingestion Architecture

### 7.1 Upload Flow

```text
User uploads file
↓
System stores raw file
↓
System identifies source format
↓
System maps columns
↓
System previews parsed rows
↓
System normalizes transactions
↓
System checks duplicates
↓
System applies rules
↓
System uses AI where confidence is low
↓
User reviews uncertain rows
↓
System commits clean records to database
```

### 7.2 Import Rules

- Raw files should be stored but should not be the working source of truth.
- Every import should create an `import_batch` record.
- Every imported transaction should reference the import batch.
- The user must be able to undo an import batch.
- The system must detect duplicates before committing records.
- Column mappings should be saved per provider.

### 7.3 Supported Import Types

MVP:

- Bank account CSV/XLSX exports

Later:

- Credit card exports
- Investment exports
- Crypto exchange exports
- Loan/debt exports
- Manual asset/liability entry

## 8. Database Schema Draft

Core tables:

```text
users
financial_institutions
accounts
uploaded_files
import_batches
transactions
transaction_categories
transaction_rules
merchants
subscriptions
assets
liabilities
investment_accounts
investment_holdings
crypto_wallets
crypto_holdings
debt_accounts
debt_payments
monthly_snapshots
financial_goals
simulation_scenarios
ai_annotations
audit_log
```

### 8.1 transactions

```text
transactions
- id
- user_id
- account_id
- import_batch_id
- transaction_date
- posted_date
- description_raw
- description_clean
- merchant_id
- amount
- currency
- direction: income | expense | transfer
- category_id
- subcategory_id
- is_recurring
- is_subscription
- is_transfer
- is_ad_hoc
- confidence_score
- user_verified
- notes
- created_at
- updated_at
```

### 8.2 accounts

```text
accounts
- id
- user_id
- institution_id
- name
- account_type: bank | credit_card | investment | crypto | debt | manual
- currency
- opening_balance
- current_balance
- is_active
- created_at
- updated_at
```

### 8.3 merchants

```text
merchants
- id
- canonical_name
- normalized_key
- category_id
- website
- notes
- created_at
- updated_at
```

### 8.4 transaction_rules

```text
transaction_rules
- id
- user_id
- match_type: contains | regex | exact | amount_range | merchant
- pattern
- merchant_id
- category_id
- direction
- is_subscription
- is_transfer
- priority
- active
- created_at
- updated_at
```

### 8.5 subscriptions

```text
subscriptions
- id
- user_id
- merchant_id
- account_id
- average_amount
- currency
- billing_frequency: monthly | annual | quarterly | weekly | unknown
- first_seen_date
- last_payment_date
- next_expected_payment_date
- status: active | cancelled | paused | unknown
- cancellation_priority: low | medium | high
- user_decision: keep | cancel | review | unknown
- notes
- created_at
- updated_at
```

### 8.6 debt_accounts

```text
debt_accounts
- id
- user_id
- provider
- name
- debt_type: loan | credit_card | personal_loan | vehicle | mortgage | other
- outstanding_balance
- interest_rate_annual
- minimum_payment
- current_monthly_payment
- due_day
- currency
- status
- created_at
- updated_at
```

### 8.7 simulation_scenarios

```text
simulation_scenarios
- id
- user_id
- name
- description
- assumptions_json
- results_json
- created_at
- updated_at
```

## 9. Categorization Strategy

Use three layers.

### Layer 1: Deterministic Rules

Examples:

```text
If description contains "Netflix" → Entertainment / Subscription
If description contains "Uber" → Transport
If description contains "Checkers" → Groceries
```

### Layer 2: Merchant Normalization

Normalize messy descriptions into canonical merchants.

Examples:

```text
NETFLIX.COM
Netflix Amsterdam
Netflix Intl
```

All become:

```text
Netflix
```

### Layer 3: AI Classification

Use AI only where rules and merchant normalization are insufficient.

AI may suggest:

- Clean merchant name
- Category
- Whether recurring
- Whether subscription
- Whether transfer
- Whether ad hoc
- Confidence score
- Human review reason

AI must return structured JSON and should not mutate financial records without user confirmation.

## 10. Subscription Detection

The system should detect:

- Monthly subscriptions
- Annual subscriptions
- Quarterly subscriptions
- Weekly subscriptions
- Price increases
- Duplicate subscriptions
- Subscriptions that are no longer useful

Detection logic:

- Same or similar merchant appears at predictable intervals.
- Similar amount appears every period.
- Merchant belongs to known subscription category.
- User confirms status.

Subscription dashboard should show:

```text
Merchant | Amount | Frequency | Last Paid | Next Expected | Status | Decision
```

User decisions:

- Keep
- Cancel
- Review
- Ignore

## 11. Ad Hoc Payment Detection

Flag payments that are unusual or hard to classify.

Signals:

- Unknown merchant
- First-time payment
- Large amount relative to usual spending
- Irregular timing
- No matching rule
- Low AI/category confidence

User actions:

- Categorize
- Add note
- Mark expected
- Mark suspicious
- Ignore going forward
- Create rule

## 12. Simulation Engine

The simulation engine should be deterministic.

Supported scenarios:

- Cancel subscriptions.
- Reduce category spend.
- Increase savings.
- Increase debt repayment.
- Increase investment contribution.
- Change expected return rate.
- Change time horizon.
- Compare scenarios.

### 12.1 Example Scenario

```text
Cancel R1,500/month in subscriptions.
Reduce dining by R2,000/month.
Move R3,500/month to debt repayment.
```

Expected outputs:

- New monthly cash flow
- Debt-free date
- Interest saved
- Investment opportunity cost
- Net worth projection

## 13. Investment Planning

Investment projections should support:

- Current balance
- Monthly contribution
- Annual return assumption
- Time horizon
- Inflation assumption
- Conservative/balanced/aggressive cases

Default return scenarios:

```text
Conservative: 5% annual return
Balanced: 8% annual return
Aggressive: 11% annual return
```

Important: the app provides planning support and scenario analysis. It should not claim to be licensed financial advice.

## 14. Debt Planning

Debt planner should support:

- Debt avalanche strategy
- Debt snowball strategy
- Hybrid strategy
- Extra repayment simulations
- Interest saved
- Payoff date

General decision rule:

```text
High-interest debt usually takes priority because paying it down gives a guaranteed return equal to the interest avoided.
```

Example:

- Debt at 18% interest is usually a stronger priority than investing for a possible 8% return.

## 15. AI Assistant Responsibilities

The AI assistant should help with:

- Transaction classification
- Merchant cleanup
- Monthly financial summaries
- Subscription review
- Scenario explanation
- Debt versus investment comparison
- Ad hoc payment investigation
- Financial habit insights
- Natural language Q&A over the database

The AI assistant must not:

- Be the source of truth
- Perform final calculations where deterministic code should be used
- Change financial records without confirmation
- Give regulated financial advice as fact
- Store data informally outside the master database

## 16. AI Tooling Rules

AI outputs should be structured.

Example classification output:

```json
{
  "merchant_name": "Netflix",
  "category": "Entertainment",
  "subcategory": "Streaming",
  "direction": "expense",
  "is_subscription": true,
  "is_recurring": true,
  "is_transfer": false,
  "is_ad_hoc": false,
  "confidence": 0.94,
  "requires_user_review": false,
  "reason": "Known recurring streaming service merchant."
}
```

All AI classifications should include confidence scores.

Low-confidence AI results should be queued for review.

## 17. Security and Privacy

Minimum requirements:

- User-level data isolation.
- Encrypted database backups.
- Secure file upload storage.
- No raw financial data in frontend logs.
- No secrets in GitHub.
- Environment variables for credentials.
- Audit log for sensitive changes.
- Ability to delete user data.
- Ability to export user data.
- Ability to undo import batches.

## 18. Dashboard Pages

### 18.1 Overview

Show:

- Net worth
- Cash balance
- Investment balance
- Crypto balance
- Debt balance
- Monthly income
- Monthly expenses
- Savings rate
- Debt-to-income ratio
- Upcoming payments
- Financial health summary

### 18.2 Transactions

Features:

- Search
- Filter by account
- Filter by merchant
- Filter by category
- Edit category
- Mark as transfer
- Mark as subscription
- Add note
- Ask AI what this payment might be

### 18.3 Subscriptions

Features:

- Active subscriptions
- Possible subscriptions
- Duplicate subscriptions
- Monthly total
- Annualized cost
- Keep/cancel/review status
- Subscription cancellation simulator

### 18.4 Simulator

Features:

- Move monthly expenses between categories
- Cancel subscriptions
- Increase debt repayment
- Increase investment contribution
- Save scenario
- Compare scenarios

### 18.5 Debt Planner

Features:

- Debt list
- Interest rates
- Minimum payments
- Current payment plan
- Avalanche comparison
- Snowball comparison
- Interest saved
- Debt-free date

### 18.6 Investment Planner

Features:

- Current assets
- Monthly contributions
- Expected return
- Time horizon
- Scenario comparison
- Inflation-adjusted projection

## 19. MVP Build Order

1. Set up project structure.
2. Set up PostgreSQL and ORM.
3. Create schema for users, accounts, uploads, import batches, and transactions.
4. Build file upload UI.
5. Build CSV/XLSX parser.
6. Build column mapping and preview.
7. Build duplicate detection.
8. Build transaction table UI.
9. Build category editing.
10. Build rules engine.
11. Build subscription detection.
12. Build dashboard summary.
13. Build simple simulation engine.
14. Add AI classification.
15. Add AI assistant.
16. Add debt planner.
17. Add investment planner.
18. Add crypto tracking.

## 20. Suggested Repository Structure

```text
/app
  /dashboard
  /transactions
  /subscriptions
  /simulator
  /debt
  /investments
  /uploads
  /settings
/components
/lib
  /db
  /imports
  /rules
  /ai
  /simulations
  /finance
/prisma
  schema.prisma
/docs
  /financial-planning-dashboard
    master-architecture.md
    data-model.md
    ai-rules.md
    import-spec.md
    codex-build-instructions.md
/tests
```

## 21. Codex Build Instructions

When Codex is used on this repository, it should follow these rules:

1. Read this file before making implementation decisions.
2. Prefer small, reviewable pull requests.
3. Build the data foundation before AI features.
4. Do not hardcode personal financial data.
5. Do not commit secrets or sample real bank exports.
6. Use deterministic financial calculations for projections.
7. Use AI for classification, explanation, and planning support.
8. Require confirmation before mutating user financial records based on AI suggestions.
9. Add tests for import parsing, duplicate detection, categorization, and simulation logic.
10. Keep raw uploads separate from normalized financial records.
11. Add an undo mechanism for import batches.
12. Make schemas explicit and migrations reviewable.
13. Use TypeScript types or backend DTOs for all API boundaries.
14. Prioritize privacy, security, and auditability.

## 22. First Engineering Milestones

### Milestone 1: Project Foundation

- Confirm stack.
- Add README.
- Add environment template.
- Add database schema.
- Add basic app shell.

### Milestone 2: Import Foundation

- Upload CSV/XLSX.
- Preview rows.
- Map columns.
- Create import batch.
- Insert normalized transactions.

### Milestone 3: Transaction Intelligence

- Add categories.
- Add merchant normalization.
- Add rules engine.
- Add manual correction UI.

### Milestone 4: Subscriptions and Recurring Payments

- Detect recurring merchants.
- Build subscription table.
- Add keep/cancel/review status.

### Milestone 5: Simulations

- Build monthly baseline.
- Add expense movement simulator.
- Add subscription cancellation simulator.
- Add investment growth calculator.
- Add debt payoff calculator.

### Milestone 6: AI Assistant

- Add AI classification endpoint.
- Add natural language summary endpoint.
- Add review queue for uncertain transactions.

## 23. Open Decisions

- Final frontend/backend stack.
- Whether to use Prisma or SQLAlchemy.
- Whether to deploy on Vercel + Neon/Supabase or a single full-stack host.
- Whether repository should remain public or become private because this is finance-related.
- Whether mock data should be generated for demos.
- Whether to include local-only mode.

## 24. Immediate Next Step

Create the initial project scaffold and database schema, then build the upload and transaction import MVP.
