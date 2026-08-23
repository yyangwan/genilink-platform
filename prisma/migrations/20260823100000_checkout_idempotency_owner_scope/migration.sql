-- Remediation §4.8: scope CheckoutSession idempotency keys per owner.
-- The global unique key let a different user replay into someone else's
-- session when keys collided.

-- DropIndex
DROP INDEX "CheckoutSession_idempotencyKey_key";

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_userId_workspaceId_idempotencyKey_key" ON "CheckoutSession"("userId", "workspaceId", "idempotencyKey");
