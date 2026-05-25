insert into public.transaction_categories (id, user_id, name, slug, color, icon, is_system, sort_order)
values
  ('00000000-0000-4000-8000-000000000001', null, 'Income', 'income', '#16a34a', 'arrow-down-left', true, 10),
  ('00000000-0000-4000-8000-000000000002', null, 'Transfers', 'transfers', '#64748b', 'repeat-2', true, 20),
  ('00000000-0000-4000-8000-000000000003', null, 'Groceries', 'groceries', '#65a30d', 'shopping-basket', true, 30),
  ('00000000-0000-4000-8000-000000000004', null, 'Dining', 'dining', '#f97316', 'utensils', true, 40),
  ('00000000-0000-4000-8000-000000000005', null, 'Transport', 'transport', '#0ea5e9', 'car', true, 50),
  ('00000000-0000-4000-8000-000000000006', null, 'Housing', 'housing', '#7c3aed', 'home', true, 60),
  ('00000000-0000-4000-8000-000000000007', null, 'Utilities', 'utilities', '#0891b2', 'plug', true, 70),
  ('00000000-0000-4000-8000-000000000008', null, 'Insurance', 'insurance', '#2563eb', 'shield-check', true, 80),
  ('00000000-0000-4000-8000-000000000009', null, 'Subscriptions', 'subscriptions', '#db2777', 'calendar-sync', true, 90),
  ('00000000-0000-4000-8000-000000000010', null, 'Entertainment', 'entertainment', '#9333ea', 'ticket', true, 100),
  ('00000000-0000-4000-8000-000000000011', null, 'Health', 'health', '#dc2626', 'heart-pulse', true, 110),
  ('00000000-0000-4000-8000-000000000012', null, 'Debt Payments', 'debt-payments', '#b45309', 'credit-card', true, 120),
  ('00000000-0000-4000-8000-000000000013', null, 'Investments', 'investments', '#059669', 'trending-up', true, 130),
  ('00000000-0000-4000-8000-000000000014', null, 'Crypto', 'crypto', '#ca8a04', 'bitcoin', true, 140),
  ('00000000-0000-4000-8000-000000000015', null, 'Fees', 'fees', '#475569', 'receipt', true, 150),
  ('00000000-0000-4000-8000-000000000016', null, 'Cash Withdrawal', 'cash-withdrawal', '#0f766e', 'banknote', true, 160),
  ('00000000-0000-4000-8000-000000000017', null, 'Unknown', 'unknown', '#71717a', 'circle-help', true, 170)
on conflict (id) do update
set name = excluded.name,
    slug = excluded.slug,
    color = excluded.color,
    icon = excluded.icon,
    is_system = excluded.is_system,
    is_active = true,
    sort_order = excluded.sort_order,
    updated_at = now();
