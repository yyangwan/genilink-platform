-- Additive release change. Existing project identities and contexts are retained.
ALTER TABLE "ProjectIntelligenceContext"
ADD COLUMN "businessPreferences" JSONB NOT NULL DEFAULT '{}';
