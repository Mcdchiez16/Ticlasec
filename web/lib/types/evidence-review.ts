export type EvidenceSource = {
  page_id: string; url: string; origin: string; excerpt: string;
  collected_at: string | null; published_at: string | null;
  content_sha256: string; passage_sha256: string;
  duplicate_of: string | null; supports_role: boolean; reason: string;
};
export type AnalystDecision = {
  decision: "accepted" | "rejected" | "needs_review";
  reason: string; next_action: string; assigned_to: string;
  source_ids: string[]; independent_confirmation: boolean;
  evidence_fingerprint: string; at: string; reviewer_id: number; stale?: boolean;
};
export type ReviewFinding = {
  id: string; value: string; entity_type: string;
  quality: { usable: boolean; score: number; reason: string; evidence_excerpt: string; rule_version: string };
  provenance: { sources: EvidenceSource[]; mention_count: number; distinct_origins: number; unique_passages: number; duplicate_count: number; fingerprint: string; independence: string };
  review: AnalystDecision | null;
  organization_match: { level: string; matches: { page_id: string; direct: string[]; contextual: string[] }[]; explanation: string };
};
export type OrganizationProfile = { name?: string; domains?: string[]; sector?: string; country?: string };
export type CaseReview = {
  investigation_id: string; query: string; version: number; status: string; model: string | null;
  synthetic: boolean; organization: OrganizationProfile; findings: ReviewFinding[];
  relationships: { id: string; source: string; target: string; type: string; page_id: string | null; interpretation: string }[];
  history: ({ kind: string; entity_id?: string; at: string; reviewer_id: number } & Partial<AnalystDecision>)[];
  generated_at: string; limitations: string;
};
