-- Keep the login-only identifier separate from the verified contact email.
ALTER TABLE "User" ADD COLUMN "loginEmail" TEXT;
CREATE UNIQUE INDEX "User_loginEmail_key" ON "User"("loginEmail");

-- Atomic time-window counters keep password throttling effective across all
-- application instances and concurrent request bursts.
CREATE TABLE "CredentialRateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredentialRateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "CredentialRateLimitBucket_expiresAt_idx"
    ON "CredentialRateLimitBucket"("expiresAt");
