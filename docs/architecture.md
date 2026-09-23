# Home Finanzas

## Status
Repository initialized. Application implementation, database schema and deployment are pending.

## Architecture
- GitHub: source control.
- Supabase: authentication, PostgreSQL and shared data synchronization.
- Cloudflare: application hosting.
- Responsive web interface with installable app support planned.

## Data boundaries
Financial amounts, transaction history, personal account details and payment schedules belong in the protected database, never in source code, demo fixtures or repository documentation.
Never commit database passwords, privileged API keys or production environment files.
All exposed tables require household-scoped row level security. Authentication alone does not grant household membership.

## Modules
Dashboard, transactions, scheduled payments, shopping list, inventory, period summaries and settings.

## Implementation order
1. Responsive application shell and empty states.
2. Authentication and household membership policies.
3. Ledger, funding sources and payment reservations.
4. Recurring obligations and idempotent period transitions.
5. Shared shopping and inventory replenishment.
6. Mobile installation and notifications.
7. Validation and Cloudflare deployment.

## Correctness requirements
Store currency in integer minor units. Separate reservations from settled expenses. Confirm purchases atomically with inventory updates. Enforce idempotency for purchases and scheduled processing. Preserve audit history for corrections. Initial balance reconciliation must not duplicate historical transactions. Display pending synchronization explicitly.

## Validation
Test authorization isolation, balance calculations, reservation settlement, repeated scheduled jobs, simultaneous checkout, historical reconciliation and replenishment deduplication.
