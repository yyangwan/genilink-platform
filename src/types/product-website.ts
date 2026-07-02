export type ProductWebsiteAnalysisStatus =
  | 'queued'
  | 'fetching'
  | 'extracting'
  | 'semantic_analyzing'
  | 'scoring'
  | 'recommendation_generating'
  | 'citation_checking'
  | 'report_generating'
  | 'completed'
  | 'partial'
  | 'failed';

export interface ProductWebsiteAnalyzeRequest {
  projectId: string;
  url?: string;
  enableAiCitation?: boolean;
  crawlerProvider?: 'native' | 'firecrawl';
}

export interface ProductWebsiteProjectContext {
  name: string;
  url: string;
  industry: string;
  product_name: string;
  product_keywords: string[];
  product_description: string;
  product_url: string;
}

export interface ProductWebsiteBrandContext {
  id: string;
  name: string;
  aliases: string[];
  is_competitor: boolean;
}

export interface ProductWebsiteUpstreamAnalyzeRequest {
  project_id: string;
  workspace_id: string;
  target_url: string;
  project: ProductWebsiteProjectContext;
  brands: ProductWebsiteBrandContext[];
  options?: {
    enable_ai_citation?: boolean;
    crawler_provider?: 'native' | 'firecrawl';
  };
}

export interface ProductWebsiteScore {
  overall: number;
  grade: string;
  dimensions: Record<string, number | undefined> & {
    aiCitability?: number;
    brandAuthority?: number;
    eeat?: number;
    technicalGeo?: number;
    schemaStructuredData?: number;
    platformOptimization?: number;
    structure?: number;
    semantic?: number;
    density?: number;
    authority?: number;
    technical?: number;
    readability?: number;
    productClarity?: number;
    aiCitationReadiness?: number;
  };
}

export interface ProductWebsitePageSnapshot {
  finalUrl?: string;
  title?: string;
  metaDescription?: string;
  description?: string;
  canonical?: string;
  lang?: string;
  charset?: string;
  viewport?: string;
  h1?: string[];
  h2?: string[];
  headings?: Array<{ level?: number; text?: string; id?: string | null }>;
  wordCount?: number;
  paragraphCount?: number;
  imageCount?: number;
  imagesMissingAlt?: number;
  schemaTypes?: string[];
  schema?: {
    jsonLdTypes?: string[];
    rawCount?: number;
  };
  links?: {
    internal?: number;
    external?: number;
    ctaCandidates?: Array<{ text?: string; href?: string }>;
  };
}

export interface ProductWebsiteRecommendation {
  id?: string;
  title: string;
  detail?: string;
  priority?: 'high' | 'medium' | 'low';
  dimension?: string;
  dimensionLabel?: string;
  impact?: 'high' | 'medium' | 'low' | string;
  effort?: 'small' | 'medium' | 'large' | string;
  problem?: string;
  evidence?: string[];
  actions?: string[];
  expectedLift?: number;
  successMetric?: string;
  examples?: string[];
}

export interface ProductWebsiteContentDetail {
  metadata?: {
    finalUrl?: string;
    domain?: string;
    title?: string;
    description?: string;
    canonical?: string;
    lang?: string;
    charset?: string;
    viewport?: string;
  };
  headings?: {
    h1?: string[];
    h2?: string[];
    h3?: string[];
    outline?: Array<{ level?: number; text?: string; id?: string | null }>;
    total?: number;
  };
  paragraphs?: Array<{ text?: string; wordCount?: number }>;
  links?: {
    internalCount?: number;
    externalCount?: number;
    ctaCandidates?: Array<{ text?: string; href?: string }>;
    externalSamples?: Array<{ text?: string; href?: string }>;
  };
  images?: {
    total?: number;
    missingAlt?: number;
    missingAltRate?: number;
  };
  schema?: {
    jsonLdTypes?: string[];
    rawCount?: number;
  };
  keywordCoverage?: {
    total?: number;
    matched?: number;
    missing?: string[];
    matchedKeywords?: string[];
    coverageRate?: number | null;
  };
  crawl?: {
    provider?: string;
    statusCode?: number | null;
    durationMs?: number | null;
    method?: string | null;
  };
}

export interface ProductWebsiteDimensionDiagnostic {
  label?: string;
  score?: number;
  status?: 'strong' | 'watch' | 'weak' | 'unknown' | string;
  summary?: string;
  evidence?: string[];
  issues?: string[];
  opportunities?: string[];
}

export interface ProductWebsiteEEATSignals {
  overall?: number;
  subScores?: {
    experience?: number;
    expertise?: number;
    authoritativeness?: number;
    trustworthiness?: number;
  };
  evidence?: Record<string, string[]>;
  gaps?: Record<string, string[]>;
}

export interface ProductWebsiteSchemaQuality {
  recommended?: string[];
  found?: string[];
  missing?: string[];
  propertyCompleteness?: Array<{
    type?: string;
    found?: boolean;
    required?: string[];
    present?: string[];
    missing?: string[];
    score?: number;
  }>;
  propertyScore?: number;
  sameAs?: {
    urls?: string[];
    domesticUrls?: string[];
    score?: number;
    status?: 'strong' | 'watch' | 'weak' | string;
  };
  examples?: Array<{
    type?: string;
    missing?: string[];
    jsonLd?: Record<string, unknown>;
  }>;
}

export interface ProductWebsitePlatformPresence {
  models?: Array<{ id?: string; label?: string }>;
  platforms?: Array<{
    id?: string;
    label?: string;
    found?: boolean;
    weight?: number;
    models?: string[];
    evidence?: string[];
  }>;
  score?: number;
  modelAdvice?: Array<{
    model?: string;
    label?: string;
    score?: number;
    coveredPlatforms?: string[];
    missingPlatforms?: string[];
    advice?: string;
  }>;
}

export interface ProductWebsiteAICitationPlatform {
  platform: string;
  status: string;
  citationCount: number;
  ownDomainCitationCount?: number;
  mentionsProduct: boolean;
  citations?: Array<{
    url: string;
    title?: string;
    domain?: string;
  }>;
  error?: string | null;
}

export interface ProductWebsiteAICitations {
  enabled: boolean;
  prompts: string[];
  platforms: ProductWebsiteAICitationPlatform[];
}

export interface ProductWebsiteTechnicalAudit {
  robots?: {
    found?: boolean;
    statusCode?: number | null;
    sitemaps?: string[];
    domesticScore?: number;
    internationalScore?: number;
    score?: number;
    summary?: string;
    blockedCritical?: Array<{ id?: string; name?: string; operator?: string; status?: string }>;
    crawlers?: Array<{
      id?: string;
      name?: string;
      operator?: string;
      market?: 'domestic' | 'international' | string;
      weight?: number;
      status?: string;
      mentioned?: boolean;
      usesWildcard?: boolean;
      crawlDelay?: number | null;
    }>;
    error?: string | null;
  };
  llms?: {
    found?: boolean;
    statusCode?: number | null;
    lineCount?: number;
    itemCount?: number;
    checks?: Record<string, boolean>;
    scores?: {
      completeness?: number;
      accuracy?: number;
      usefulness?: number;
      overall?: number;
    };
    missingChecks?: string[];
    error?: string | null;
  };
  llmsFull?: ProductWebsiteTechnicalAudit['llms'];
  score?: {
    crawlerAccess?: number;
    llmsReadiness?: number;
    overall?: number;
  };
  error?: string;
}

export interface ProductWebsiteResultSnapshot {
  score?: ProductWebsiteScore;
  page?: ProductWebsitePageSnapshot;
  geoAudit?: {
    methodology?: string;
    weights?: Record<string, number>;
    businessType?: {
      type?: string;
      label?: string;
      signals?: Record<string, number>;
    };
    schemaQuality?: ProductWebsiteSchemaQuality;
    platformPresence?: ProductWebsitePlatformPresence;
    citabilitySignals?: Record<string, number | string | undefined>;
    eeatSignals?: ProductWebsiteEEATSignals;
    technicalAudit?: ProductWebsiteTechnicalAudit;
  };
  technicalAudit?: ProductWebsiteTechnicalAudit;
  contentDetail?: ProductWebsiteContentDetail;
  dimensionDiagnostics?: Record<string, ProductWebsiteDimensionDiagnostic>;
  recommendations?: ProductWebsiteRecommendation[];
  aiCitations?: ProductWebsiteAICitations;
  summary?: string;
}

export interface ProductWebsiteAnalysis {
  id: number;
  project_id?: string;
  target_url: string;
  status: ProductWebsiteAnalysisStatus;
  stage?: string | null;
  score_overall?: number | null;
  score_grade?: string | null;
  result_snapshot?: ProductWebsiteResultSnapshot | null;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
}

export interface ProductWebsiteTrendPoint {
  analysisId: number;
  date: string;
  overall?: number | null;
  grade?: string | null;
  dimensions?: ProductWebsiteScore['dimensions'];
  status: ProductWebsiteAnalysisStatus;
}

export interface ProductWebsiteTrends {
  projectId: string;
  range: string;
  points: ProductWebsiteTrendPoint[];
  summary: {
    currentScore?: number | null;
    delta?: number | null;
  };
}
