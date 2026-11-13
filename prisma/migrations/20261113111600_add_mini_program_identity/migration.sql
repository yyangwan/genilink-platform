-- AlterTable
ALTER TABLE "SmsVerificationCode" ADD COLUMN     "miniProgramBindingId" TEXT;

-- CreateTable
CREATE TABLE "MiniProgramIdentity" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "unionId" TEXT,
    "userId" TEXT NOT NULL,
    "boundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiniProgramIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiniProgramSession" (
    "tokenHash" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiniProgramSession_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "MiniProgramBinding" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "unionId" TEXT,
    "verifiedPhone" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiniProgramBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiniProgramWebPair" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "MiniProgramWebPair_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "MiniProgramAgreement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiniProgramAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MiniProgramIdentity_appId_openId_key" ON "MiniProgramIdentity"("appId", "openId");

-- CreateIndex
CREATE UNIQUE INDEX "MiniProgramIdentity_appId_userId_key" ON "MiniProgramIdentity"("appId", "userId");

-- CreateIndex
CREATE INDEX "MiniProgramSession_expiresAt_idx" ON "MiniProgramSession"("expiresAt");

-- CreateIndex
CREATE INDEX "MiniProgramSession_identityId_idx" ON "MiniProgramSession"("identityId");

-- CreateIndex
CREATE UNIQUE INDEX "MiniProgramBinding_tokenHash_key" ON "MiniProgramBinding"("tokenHash");

-- CreateIndex
CREATE INDEX "MiniProgramBinding_expiresAt_idx" ON "MiniProgramBinding"("expiresAt");

-- CreateIndex
CREATE INDEX "MiniProgramWebPair_expiresAt_idx" ON "MiniProgramWebPair"("expiresAt");

-- CreateIndex
CREATE INDEX "MiniProgramWebPair_userId_idx" ON "MiniProgramWebPair"("userId");

-- CreateIndex
CREATE INDEX "SmsVerificationCode_miniProgramBindingId_createdAt_idx" ON "SmsVerificationCode"("miniProgramBindingId", "createdAt");

-- AddForeignKey
ALTER TABLE "MiniProgramIdentity" ADD CONSTRAINT "MiniProgramIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiniProgramSession" ADD CONSTRAINT "MiniProgramSession_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "MiniProgramIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiniProgramWebPair" ADD CONSTRAINT "MiniProgramWebPair_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiniProgramAgreement" ADD CONSTRAINT "MiniProgramAgreement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
