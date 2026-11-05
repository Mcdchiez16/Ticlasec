export type CreateInvestigationBody = {
  query: string;
  model?: string;
  run_crawler: boolean;
  depth: "fast" | "standard" | "deep";
  intelligence_scope: {
    profile_id: "global" | "zambia" | "custom";
    focus_name?: string;
    keywords?: string[];
  };
  /** Run over a built-in synthetic dataset instead of the live network. */
  synthetic_scenario?: string;
};
