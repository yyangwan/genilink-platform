#!/usr/bin/env bash
# Production pre-migration audit for the billing remediation (docs/billing-
# checkout-review-remediation-plan.md §4.10). READ-ONLY: never mutates data.
#
# Run on the production host (or against a production replica) BEFORE
# prisma-migrate-deploy. It compares the live structure against what the
# pending migrations expect, so a prior `prisma db push` can be detected
# instead of failing mid-deploy.
#
# Usage:
#   DATABASE_URL="postgresql://..." ./scripts/billing-premigration-check.sh
#
# Exit codes: 0 = clean, 1 = drift detected (see report), 2 = connection error.

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point at the production database (read-only usage)}"

# Override for setups where psql is not on PATH, e.g. local docker:
#   PSQL_CMD="docker exec -i genilink-postgres psql -U genilink -d genilink" \
#     DATABASE_URL=x ./scripts/billing-premigration-check.sh
PSQL_CMD=${PSQL_CMD:-psql}
read -r -a PSQL <<< "$PSQL_CMD"
PSQL+=("$DATABASE_URL" -v ON_ERROR_STOP=1 -Atq)

report() { printf '%s\n' "$*"; }
section() { printf '\n=== %s ===\n' "$*"; }

fail=0

section "_prisma_migrations applied so far"
"${PSQL[@]}" -c "SELECT migration_name || '|' || COALESCE(finished_at::text, 'unfinished') FROM _prisma_migrations ORDER BY migration_name;" || exit 2

section "Migration-owned objects"
while IFS='|' read -r migration kind name; do
  [ -z "$migration" ] && continue
  applied=$("${PSQL[@]}" -c "SELECT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '$migration' AND finished_at IS NOT NULL AND rolled_back_at IS NULL);" < /dev/null 2>/dev/null || echo "f")
  exists=$("${PSQL[@]}" -c "SELECT to_regclass('public.\"$name\"') IS NOT NULL;" < /dev/null 2>/dev/null || echo "f")
  if [ "$applied" = "t" ] && [ "$exists" != "t" ]; then
    report "DRIFT: applied migration $migration is missing $kind $name"
    fail=1
  elif [ "$applied" != "t" ] && [ "$exists" = "t" ]; then
    report "DRIFT: unapplied migration $migration already owns existing $kind $name"
    fail=1
  elif [ "$applied" = "t" ]; then
    report "ok: applied $migration owns existing $kind $name"
  else
    report "ok: pending $migration will create $kind $name"
  fi
done <<'OBJECTS'
20260821143000_add_usage_events|table|UsageEvent
20260821143100_backfill_billing_plans_orders|table|BillingPlan
20260821143100_backfill_billing_plans_orders|table|PaymentOrder
20260821143100_backfill_billing_plans_orders|table|PaymentEvent
20260821143200_add_projectbrand_index|index|ProjectBrand_projectId_idx
20260822120000_billing_checkout_promotions_renewals|table|CheckoutSession
20260822120000_billing_checkout_promotions_renewals|table|Promotion
20260822120000_billing_checkout_promotions_renewals|table|Coupon
20260822120000_billing_checkout_promotions_renewals|table|CouponRedemption
20260822120000_billing_checkout_promotions_renewals|table|PaymentAgreement
20260822120000_billing_checkout_promotions_renewals|table|RenewalAttempt
20260823100000_checkout_idempotency_owner_scope|index|CheckoutSession_userId_workspaceId_idempotencyKey_key
OBJECTS

section "Columns the migrations expect to ADD (must NOT exist yet)"
# CheckoutSession unique constraint replacement (§4.8)
owner_scope_applied=$("${PSQL[@]}" -c "SELECT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20260823100000_checkout_idempotency_owner_scope' AND finished_at IS NOT NULL AND rolled_back_at IS NULL);" < /dev/null 2>/dev/null || echo "f")
old_idx=$("${PSQL[@]}" -c "SELECT to_regclass('public.\"CheckoutSession_idempotencyKey_key\"') IS NOT NULL;" < /dev/null 2>/dev/null || echo "f")
if [ "$owner_scope_applied" = "t" ] && [ "$old_idx" = "t" ]; then
  report "DRIFT: owner-scoped migration is applied but legacy global index still exists"
  fail=1
elif [ "$owner_scope_applied" != "t" ] && [ "$old_idx" = "t" ]; then
  report "expected: pending owner-scoped migration will replace the legacy global index"
elif [ "$owner_scope_applied" = "t" ]; then
  report "ok: legacy global idempotency index removed"
else
  report "DRIFT: owner-scoped migration is pending but legacy global index is absent"
  fail=1
fi

section "Existing data safety (counts; must be preserved by deploy)"
for t in Subscription PaymentOrder PaymentEvent CheckoutSession; do
  cnt=$("${PSQL[@]}" -c "SELECT COALESCE((SELECT reltuples::bigint FROM pg_class WHERE relname = '$t'), -1);" < /dev/null 2>/dev/null || echo "-1")
  report "approx rows in $t: $cnt"
done

section "Verdict"
if [ "$fail" -eq 0 ]; then
  report "CLEAN: no blocking drift detected. Proceed with a rehearsal on a production-structure copy (§4.10.6), then prisma-migrate-deploy."
else
  report "DRIFT DETECTED: compare each flagged object field-by-field against prisma/schema.prisma. If fully equivalent use prisma-migrate-resolve --applied <migration>; if partial, write a compatibility migration — do NOT mark wholesale (§4.10.4/§4.10.5)."
  exit 1
fi
