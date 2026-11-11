// Learning pathway and skill-gap list / summary (snake_case, like the backend).
import { GapPriority, GapType, LearningRecommendation, RecommendationSource } from './requirement.model';

export interface PathwayStep extends LearningRecommendation {
  step: number;
  gap_type: GapType | null;
  gap_size: number | null;
  mandatory: boolean | null;
}

export interface LearningPathway {
  matching_result_id: number;
  matching_run_id: number;
  requirement_id: number;
  requirement_role: string | null;
  employee_id: number;
  employee_code: string;
  resource_name: string;
  match_category: string;
  steps: PathwayStep[];
  totals: {
    steps: number;
    steps_counted: number;
    rejected_steps: number;
    estimated_steps: number;
    unestimated_steps: number;
    total_estimated_hours: number;
    total_estimated_weeks: number;
    awaiting_lk_review: number;
    ai_generated_steps: number;
    by_review_status: Record<string, number>;
    by_source: Record<string, number>;
  };
  notes?: string[];
}

export interface GapListItem {
  skill_gap_id: number;
  matching_result_id: number;
  matching_run_id: number;
  requirement_id: number;
  employee_id: number;
  employee_code: string;
  resource_name: string;
  skill_id: number;
  skill_name: string;
  gap_type: GapType;
  mandatory: boolean;
  required_level: number;
  current_level: number | null;
  gap_size: number;
  priority: GapPriority;
  priority_reason: string | null;
  learning_recommendation_count: number;
  recommendation_sources: RecommendationSource[];
}

export interface GapList {
  total: number;
  returned: number;
  gaps: GapListItem[];
}

export interface GapFilters {
  requirementId?: number | null;
  runId?: number | null;
  employeeId?: number | null;
  priority?: GapPriority | '' | null;
  gapType?: GapType | '' | null;
  mandatory?: boolean | null;
  skillId?: number | null;
  hasRecommendation?: boolean | null;
  limit?: number | null;
  topN?: number | null;
}

export interface CommonGapSkill {
  skill_id: number;
  skill_name: string;
  gap_count: number;
  missing_count: number;
  below_required_count: number;
  mandatory_count: number;
  employees_affected: number;
}

export interface GapSummary {
  runs_covered: number[];
  total_gaps: number;
  employees_with_gaps: number;
  mandatory_gaps: number;
  gaps_without_recommendation: number;
  by_priority: Record<GapPriority, number>;
  by_gap_type: Record<GapType, number>;
  most_common_gap_skills: CommonGapSkill[];
}
