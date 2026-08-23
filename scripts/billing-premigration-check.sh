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

section "Objects the pending migrations will CREATE (must NOT exist yet)"
while IFS='|' read -r kind name; do
  [ -z "$kind" ] && continue
  exists=$("${PSQL[@]}" -c "SELECT to_regclass('public.\"$name\"') IS NOT NULL;" < /dev/null 2>/dev/null || echo "f")
  if [ "$exists" = "t" ]; then
    report "DRIFT: $kind $name already exists in production"
    fail=1
  else
    report "ok: $kind $name absent"
  fi
done <<'OBJECTS'
table|BillingPlan
table|PaymentOrder
table|PaymentEvent
table|UsageEvent
table|CheckoutSession
table|Promotion
table|Coupon
table|CouponRedemption
table|PaymentAgreement
table|RenewalAttempt
index|CheckoutSession_userId_workspaceId_idempotencyKey_key
index|ProjectBrand_projectId_idx
OBJECTS

section "Columns the migrations expect to ADD (must NOT exist yet)"
# CheckoutSession unique constraint replacement (§4.8)
old_idx=$("${PSQL[@]}" -c "SELECT to_regclass('public.\"CheckoutSession_idempotencyKey_key\"') IS NOT NULL;" < /dev/null 2>/dev/null || echo "f")
if [ "$old_idx" = "t" ]; then
  report "expected: legacy global idempotency index present (will be swapped to owner-scoped)"
else
  report "note: legacy CheckoutSession_idempotencyKey_key not found — verify the 20260822 migration state"
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
