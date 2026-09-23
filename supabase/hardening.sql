-- Applied after initial_financial_foundation.
-- Restricts a platform-created internal event trigger function.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
