create index fund_deposits_created_by on public.fund_deposits(created_by);
create index weekly_payment_plans_created_by on public.weekly_payment_plans(created_by);
create index weekly_payment_plans_fund on public.weekly_payment_plans(fund_id,household_id);
create index weekly_payment_entries_created_by on public.weekly_payment_entries(created_by);
create index weekly_payment_entries_expense on public.weekly_payment_entries(expense_id,household_id);
create index expenses_reservation_fund_household on public.expenses(reservation_id,fund_id,household_id);
