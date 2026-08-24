-- Persisted, one-time SMS challenges support expiry, attempt limits, and
-- rate limiting across all application instances.
CREATE TABLE "SmsVerificationCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'login',
    "ipHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsVerificationCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SmsVerificationCode_phone_purpose_createdAt_idx"
    ON "SmsVerificationCode"("phone", "purpose", "createdAt");
CREATE INDEX "SmsVerificationCode_ipHash_createdAt_idx"
    ON "SmsVerificationCode"("ipHash", "createdAt");
CREATE INDEX "SmsVerificationCode_expiresAt_idx"
    ON "SmsVerificationCode"("expiresAt");

ALTER TABLE "SmsVerificationCode"
    ADD CONSTRAINT "SmsVerificationCode_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
