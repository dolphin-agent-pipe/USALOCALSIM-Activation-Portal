# Partner commission payout runbook

Operations guide for the USALOCALSIM partner commission + Wise payout system (Phases A–F).

## Daily cron sequence (recommended UTC)

1. **Promote eligible** — `POST /api/admin/commissions/promote-eligible`  
   Moves `PENDING_FUNDS` commissions to `ELIGIBLE` after settlement hold.

2. **Daily payouts** — `POST /api/admin/payouts/run-daily`  
   Consolidates net payable commissions per partner and submits one Wise transfer per partner per UTC day.

Authenticate cron with header `x-cron-secret: $COMMISSION_PAYOUT_CRON_SECRET` or query `?secret=...`.

Example (Hostinger cron / external scheduler):

```bash
curl -sS -X POST "https://your-domain/api/admin/commissions/promote-eligible" \
  -H "x-cron-secret: $COMMISSION_PAYOUT_CRON_SECRET"

curl -sS -X POST "https://your-domain/api/admin/payouts/run-daily" \
  -H "x-cron-secret: $COMMISSION_PAYOUT_CRON_SECRET"
```

## Feature flags

| Variable | When to set |
|----------|-------------|
| `COMMISSION_PAYOUTS_ENABLED=true` | Production payouts on |
| `COMMISSION_PAYOUTS_SIMULATE=true` | Local/staging only — skips Wise, marks PAID |
| `COMMISSION_ALERT_EMAIL` | Comma-separated ops emails for failures / stuck batches |

**Never** enable `COMMISSION_PAYOUTS_SIMULATE` in production.

## Health check

`GET /api/admin/payouts/health` (admin session) returns:

- Feature flags (payouts enabled, Wise configured, alert emails)
- Commission counts by status
- Active cron locks
- Processing / failed batch counts

## Admin UI

| Page | Purpose |
|------|---------|
| `/admin/commissions` | Ledger, promote eligible, refunds/chargebacks |
| `/admin/payouts` | Daily batches, run payouts, export CSV, sync Wise |
| `/admin/partners/[id]` | Partner bank profile + Wise recipient |

## Payout failure playbook

1. Open `/admin/payouts` and find `FAILED` batch.
2. Read `wiseStatusMessage` on the latest attempt.
3. Fix root cause (missing bank details, Wise balance, invalid `transferNature`, etc.).
4. Failed batches **return commissions to ELIGIBLE** automatically — safe to re-run daily job after fix.
5. For `PROCESSING` batches older than 48h, use **Sync Wise** or wait for webhook `POST /api/webhooks/wise`.

## Double-pay protection

- DB lock prevents overlapping daily payout and promote-eligible crons.
- Per-partner lock prevents two payout workers for the same partner/day.
- Commissions are claimed with `payoutBatchId IS NULL` atomic update — concurrent claims fail safely.
- One `PayoutBatch` per partner per UTC `payoutDate` (unique constraint).
- Wise `customerTransactionId` is unique per attempt (`payout-{batchId}-{attemptId}`).

## Wise webhook

Configure Wise to POST transfer status updates to:

`https://your-domain/api/webhooks/wise`

Set `WISE_WEBHOOK_SECRET` and verify signatures in production.

## Stripe chargebacks

Stripe `charge.refunded` / `charge.dispute.created` webhooks cancel unpaid commissions or create chargeback balances. No manual step unless `ADMIN_REVIEW`.

## Migrations

After deploy:

```bash
npm run db:migrate:deploy
```

Phase F adds `CronJobLock` for cron idempotency.

## PIX provider switch (Phase E)

Set `PIX_PROVIDER` to choose customer PIX checkout without changing commission logic:

| Value | Behavior |
|-------|----------|
| `none` | PIX button hidden |
| `stripe` | Stripe Checkout with `payment_method_types: ['pix']` (Brazil BRL) |
| `asaas` | Direct Asaas API when `ASAAS_API_KEY` set; otherwise Mercado Pago bridge |

Commission events (`onPaymentConfirmed` / `onFundsSettledAvailable`) flow through `customer-payment-bridge.ts`. PIX sales promote to `ELIGIBLE` immediately unless `COMMISSION_PIX_IMMEDIATE_SETTLE=false`.

Webhooks:

- Mercado Pago: `/api/mercadopago/webhook` (bridge mode)
- Asaas: `/api/webhooks/asaas` (direct mode)
- Stripe PIX: `/api/stripe/webhook` (`cart_voucher_pix` flow)

## Escalation

- Stuck `PROCESSING` > `COMMISSION_PAYOUT_STUCK_HOURS` → alert email + manual Wise dashboard check.
- Repeated `commission_claim_conflict` in audit logs → investigate duplicate cron schedulers.
- `REVIEW` batch status → Wise not configured when payout ran; configure env and retry.
