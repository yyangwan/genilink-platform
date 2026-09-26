-- CreateTable
CREATE TABLE "AcquisitionSession" (
    "id" TEXT NOT NULL,
    "anonymousHash" TEXT NOT NULL,
    "userId" TEXT,
    "firstSource" TEXT,
    "firstMedium" TEXT,
    "firstCampaign" TEXT,
    "lastSource" TEXT,
    "lastMedium" TEXT,
    "lastCampaign" TEXT,
    "firstTouch" JSONB NOT NULL,
    "lastTouch" JSONB NOT NULL,
    "landingPath" TEXT NOT NULL,
    "referrerHost" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AcquisitionSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcquisitionIntent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "targetUrl" TEXT,
    "planKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "projectId" TEXT,
    "analysisId" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "errorCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AcquisitionIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FunnelEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "workspaceId" TEXT,
    "projectId" TEXT,
    "eventName" TEXT NOT NULL,
    "eventSource" TEXT NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "properties" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FunnelEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FunnelDailyMetric" (
    "id" TEXT NOT NULL,
    "metricDate" DATE NOT NULL,
    "eventName" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "medium" TEXT NOT NULL DEFAULT '',
    "campaign" TEXT NOT NULL DEFAULT '',
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "visitorCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FunnelDailyMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcquisitionSession_anonymousHash_key" ON "AcquisitionSession"("anonymousHash");
CREATE INDEX "AcquisitionSession_userId_createdAt_idx" ON "AcquisitionSession"("userId", "createdAt");
CREATE INDEX "AcquisitionSession_expiresAt_idx" ON "AcquisitionSession"("expiresAt");
CREATE UNIQUE INDEX "AcquisitionIntent_idempotencyKey_key" ON "AcquisitionIntent"("idempotencyKey");
CREATE INDEX "AcquisitionIntent_userId_status_idx" ON "AcquisitionIntent"("userId", "status");
CREATE INDEX "AcquisitionIntent_sessionId_createdAt_idx" ON "AcquisitionIntent"("sessionId", "createdAt");
CREATE INDEX "AcquisitionIntent_expiresAt_status_idx" ON "AcquisitionIntent"("expiresAt", "status");
CREATE UNIQUE INDEX "FunnelEvent_eventId_key" ON "FunnelEvent"("eventId");
CREATE INDEX "FunnelEvent_eventName_occurredAt_idx" ON "FunnelEvent"("eventName", "occurredAt");
CREATE INDEX "FunnelEvent_source_medium_campaign_occurredAt_idx" ON "FunnelEvent"("source", "medium", "campaign", "occurredAt");
CREATE INDEX "FunnelEvent_sessionId_occurredAt_idx" ON "FunnelEvent"("sessionId", "occurredAt");
CREATE INDEX "FunnelEvent_userId_occurredAt_idx" ON "FunnelEvent"("userId", "occurredAt");
CREATE INDEX "FunnelEvent_workspaceId_occurredAt_idx" ON "FunnelEvent"("workspaceId", "occurredAt");
CREATE UNIQUE INDEX "FunnelDailyMetric_metricDate_eventName_source_medium_campaign_key" ON "FunnelDailyMetric"("metricDate", "eventName", "source", "medium", "campaign");
CREATE INDEX "FunnelDailyMetric_eventName_metricDate_idx" ON "FunnelDailyMetric"("eventName", "metricDate");

ALTER TABLE "AcquisitionSession" ADD CONSTRAINT "AcquisitionSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcquisitionIntent" ADD CONSTRAINT "AcquisitionIntent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcquisitionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcquisitionIntent" ADD CONSTRAINT "AcquisitionIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcquisitionIntent" ADD CONSTRAINT "AcquisitionIntent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcquisitionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CheckoutSession" ADD COLUMN "acquisitionSessionId" TEXT,
ADD COLUMN "attributionSnapshot" JSONB;
ALTER TABLE "PaymentOrder" ADD COLUMN "acquisitionSessionId" TEXT,
ADD COLUMN "attributionSnapshot" JSONB;
CREATE INDEX "CheckoutSession_acquisitionSessionId_createdAt_idx" ON "CheckoutSession"("acquisitionSessionId", "createdAt");
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_acquisitionSessionId_fkey" FOREIGN KEY ("acquisitionSessionId") REFERENCES "AcquisitionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_acquisitionSessionId_fkey" FOREIGN KEY ("acquisitionSessionId") REFERENCES "AcquisitionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "systemRole" TEXT NOT NULL DEFAULT 'user';

CREATE TABLE "MarketingLead" (
  "id" TEXT NOT NULL, "sessionId" TEXT, "userId" TEXT, "kind" TEXT NOT NULL,
  "companyName" TEXT NOT NULL, "website" TEXT, "industry" TEXT,
  "contactCiphertext" TEXT, "contactHash" TEXT,
  "projectCountBand" TEXT, "budgetBand" TEXT, "timeline" TEXT,
  "deploymentPreference" TEXT, "requirements" TEXT,
  "score" INTEGER NOT NULL DEFAULT 0, "grade" TEXT NOT NULL DEFAULT 'cold',
  "status" TEXT NOT NULL DEFAULT 'new', "version" INTEGER NOT NULL DEFAULT 1,
  "contactConsentAt" TIMESTAMP(3) NOT NULL, "contactWithdrawnAt" TIMESTAMP(3),
  "withdrawalTokenHash" TEXT NOT NULL, "privacyVersion" TEXT NOT NULL,
  "submissionToken" TEXT NOT NULL, "assignedUserId" TEXT, "lastContactedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingLead_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MarketingLeadStatusEvent" (
  "id" TEXT NOT NULL, "leadId" TEXT NOT NULL, "fromStatus" TEXT, "toStatus" TEXT NOT NULL,
  "actorUserId" TEXT, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingLeadStatusEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MarketingLeadPrivacyEvent" (
  "id" TEXT NOT NULL, "leadId" TEXT NOT NULL, "action" TEXT NOT NULL,
  "reason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingLeadPrivacyEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LeadNotificationDelivery" (
  "id" TEXT NOT NULL, "leadId" TEXT NOT NULL, "destination" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending', "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastError" TEXT,
  "lockedBy" TEXT, "lockedUntil" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeadNotificationDelivery_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SystemRoleAudit" (
  "id" TEXT NOT NULL, "targetUserId" TEXT NOT NULL, "actorUserId" TEXT,
  "fromRole" TEXT NOT NULL, "toRole" TEXT NOT NULL, "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemRoleAudit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketingLead_submissionToken_key" ON "MarketingLead"("submissionToken");
CREATE INDEX "MarketingLead_status_grade_createdAt_idx" ON "MarketingLead"("status", "grade", "createdAt");
CREATE INDEX "MarketingLead_kind_createdAt_idx" ON "MarketingLead"("kind", "createdAt");
CREATE INDEX "MarketingLead_contactHash_idx" ON "MarketingLead"("contactHash");
CREATE INDEX "MarketingLead_assignedUserId_status_idx" ON "MarketingLead"("assignedUserId", "status");
CREATE INDEX "MarketingLeadStatusEvent_leadId_createdAt_idx" ON "MarketingLeadStatusEvent"("leadId", "createdAt");
CREATE INDEX "MarketingLeadPrivacyEvent_leadId_createdAt_idx" ON "MarketingLeadPrivacyEvent"("leadId", "createdAt");
CREATE UNIQUE INDEX "LeadNotificationDelivery_leadId_destination_key" ON "LeadNotificationDelivery"("leadId", "destination");
CREATE INDEX "LeadNotificationDelivery_status_nextRetryAt_idx" ON "LeadNotificationDelivery"("status", "nextRetryAt");
CREATE INDEX "SystemRoleAudit_targetUserId_createdAt_idx" ON "SystemRoleAudit"("targetUserId", "createdAt");
ALTER TABLE "MarketingLead" ADD CONSTRAINT "MarketingLead_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcquisitionSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingLead" ADD CONSTRAINT "MarketingLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingLead" ADD CONSTRAINT "MarketingLead_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingLeadStatusEvent" ADD CONSTRAINT "MarketingLeadStatusEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "MarketingLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingLeadPrivacyEvent" ADD CONSTRAINT "MarketingLeadPrivacyEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "MarketingLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingLeadStatusEvent" ADD CONSTRAINT "MarketingLeadStatusEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadNotificationDelivery" ADD CONSTRAINT "LeadNotificationDelivery_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "MarketingLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SystemRoleAudit" ADD CONSTRAINT "SystemRoleAudit_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SystemRoleAudit" ADD CONSTRAINT "SystemRoleAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
