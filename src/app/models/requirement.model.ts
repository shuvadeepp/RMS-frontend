// Requirements, matches, skill gaps, dashboard and audit use snake_case.
// Timestamps are India time (IST) and are shown as sent; read them with parseTimestamp() in shared/labels.
import { DecisionValue } from './decision.model';
import { PersonTag, TaggedPeopleSummary } from './tagged-people.model';

export type WorkMode = 'AS_REQUIRED' | 'ONSITE' | 'HYBRID' | 'REMOTE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type MatchCategory = 'EXCELLENT' | 'GOOD' | 'PARTIAL' | 'LOW';
export type RecommendationStatus = 'REVIEW_REQUIRED' | 'RECOMMENDED' | 'NOT_RECOMMENDED';
export type RunTrigger = 'NEW_SEARCH' | 'REMATCH_AFTER_LEARNING' | 'MANUAL_REMATCH';
export type RunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED';

export interface RequiredSkill {
  skill_name: string;
  mandatory: boolean;
  minimum_proficiency: number;
}

export interface RequirementRequest {
  project_id?: number;
  project_code?: string;
  project_name?: string;
  joining_date?: string;
  minimum_experience_years?: number | null;
  designation?: string;
  department?: string;
  work_mode?: WorkMode;
  priority?: Priority;
  duration_months?: number | null;
  headcount?: number | null;
  location?: string;
  description?: string;
  required_skills?: RequiredSkill[];
}

// Preview items (skills without project/date): not saved, no actions possible.
export interface LlmMatch {
  employee_code: string;
  resource_name: string;
  match_score?: number | null;
  category?: string | null;
  matching_skills?: SkillRef[] | null;
  missing_skills?: SkillRef[] | null;
  explanation?: string | null;
  // Set when the person is tagged but still kept in the results.
  tags?: PersonTag[] | null;
  window_free_percentage?: number | null;
}

// POST /api/requirements?async=true. One of three shapes:
// 202 accepted (run queued), 200 preview (llm_result), 200 filter-only (employees).
export interface RequirementCreateResponse {
  status?: string;
  message?: string;
  saved?: boolean;
  requirement_id?: number | null;
  matching_run_id?: number | null;
  run_status?: RunStatus | null;
  employees_sent?: number | null;
  employees?: RawEmployee[];
  llm_result?: {
    total_qualified_matches?: number;
    matches?: LlmMatch[];
    note?: string;
  } | null;
  // Sent when skills / joining_date are given: who was left out (or kept) because they are tagged.
  tagged_people?: TaggedPeopleSummary | null;
}

// Employees inside the requirements response may use either casing.
export interface RawEmployee {
  employee_id?: number;
  employeeCode?: string;
  employee_code?: string;
  name?: string;
  resource_name?: string;
  designation?: string | null;
  department?: string | null;
  totalExperienceYears?: number | null;
  total_experience_years?: number | null;
  availabilityStatus?: string | null;
  availability_status?: string | null;
  availability?: string | null;
  availableCapacityPercentage?: number | null;
  available_capacity_percentage?: number | null;
  skills?: Array<{
    name?: string;
    skill_name?: string;
    proficiency?: number;
    proficiency_level?: number;
  }>;
}

export interface MatchingRun {
  matching_run_id: number;
  requirement_id: number;
  run_status: RunStatus;
  candidate_pool_size?: number | null;
  execution_date?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  result_count?: number | null;
  project_name?: string | null;
  run_trigger?: RunTrigger | null;
  previous_run_id?: number | null;
  rematch_note?: string | null;
  // Not sent by the backend yet; the scan console uses it only when present.
  progress?: MatchingRunProgress | null;
}

export interface MatchingRunProgress {
  processed?: number | null;
  total?: number | null;
  best_score?: number | null;
  current_employee_name?: string | null;
  stage?: string | null;
}

export interface Requirement {
  requirement_id: number;
  project_id?: number | null;
  project_code?: string | null;
  project_name?: string | null;
  joining_date?: string | null;
  minimum_experience_years?: number | null;
  designation?: string | null;
  department?: string | null;
  work_mode?: string | null;
  priority?: string | null;
  duration_months?: number | null;
  headcount?: number | null;
  location?: string | null;
  description?: string | null;
  requirement_status?: string | null;
  status?: string | null;
  required_skills?: RequiredSkill[];
}

// Skills inside strengths / gaps can arrive as plain names or objects.
export type SkillRef = string | SkillObject;

export interface SkillObject {
  skill?: string;
  skill_name?: string;
  name?: string;
  required_proficiency?: number;
  minimum_proficiency?: number;
  current_proficiency?: number;
  employee_proficiency?: number;
  proficiency?: number;
}

export interface LearningSuggestion {
  skill_name: string;
  target_proficiency?: number;
  current_proficiency?: number;
  suggestion?: string;
  recommended_action?: string;
  learning_action?: string;
}

export interface CurrentDecision {
  allocation_decision_id: number | null;
  decision: DecisionValue;
  decision_reason: string | null;
  decision_maker: string | null;
  decision_date: string | null;
  allocation_id: number | null;
}

export interface MatchResult {
  matching_result_id: number;
  employee_id: number;
  employee_code: string;
  resource_name: string;
  designation?: string | null;
  department?: string | null;
  total_experience_years?: number | null;
  availability?: string | null;
  overall_score: number;
  match_category: MatchCategory | string;
  rank_position?: number | null;
  recommendation_status: RecommendationStatus | string;
  strengths?: {
    matching_skills?: SkillRef[];
    transferable_skills?: SkillRef[];
  } | null;
  skill_gaps?: {
    missing_skills?: SkillRef[];
    below_required_proficiency?: SkillRef[];
  } | null;
  explanation?: string | null;
  learning_suggestions?: LearningSuggestion[] | null;
  current_decision?: CurrentDecision | null;
  tags?: PersonTag[] | null;
  window_free_percentage?: number | null;
  run_trigger?: RunTrigger | null;
  previous_run_id?: number | null;
  gap_details?: SkillGap[];
}

// ---------- Skill gaps and learning ----------
export type ResourceType = 'COURSE' | 'CERTIFICATION' | 'DOCUMENTATION' | 'MENTORING' | 'PRACTICAL_ASSIGNMENT' | 'OTHER' | 'ASSESSMENT';
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED';
export type GapPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type GapType = 'MISSING' | 'BELOW_REQUIRED';
export type RecommendationSource = 'LK_REPOSITORY' | 'AI_GENERATED' | 'RULE_BASED' | 'MANUAL';
export type ValidationMethod = 'KNOWLEDGE_ASSESSMENT' | 'PRACTICAL_ASSIGNMENT' | 'DEMONSTRATION' | 'TECHNICAL_REVIEW' | 'CERTIFICATE' | 'NONE';
export type EvidenceType = 'ASSESSMENT' | 'CERTIFICATION' | 'PROJECT_EXPERIENCE' | 'PRACTICAL_ASSIGNMENT' | 'OTHER';

export interface SkillGap {
  skill_gap_id?: number | null;          // null for old runs shown from live data
  skill_id?: number | null;
  skill_name: string;
  gap_type?: GapType | null;
  required_level: number | null;
  current_level: number | null;          // null = skill missing
  gap_size?: number | null;
  mandatory: boolean;
  priority?: GapPriority | null;
  priority_reason?: string | null;
  gap_description?: string | null;
}

export interface LearningRecommendation {
  learning_recommendation_id: number;
  skill_name: string;
  current_proficiency?: number | null;
  target_proficiency?: number | null;
  learning_action?: string | null;
  learning_resource?: string | null;
  resource_type?: ResourceType | string | null;
  review_status: ReviewStatus | string;
  review_comments?: string | null;
  skill_gap_id?: number | null;
  learning_resource_id?: number | null;
  recommendation_source?: RecommendationSource | null;
  priority?: GapPriority | null;
  sequence_order?: number | null;
  estimated_hours?: number | null;       // only for L&K catalog items
  estimated_weeks?: number | null;
  validation_method?: ValidationMethod | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface SkillGapReport {
  matching_result_id: number;
  matching_run_id?: number;
  employee_id?: number;
  employee_code: string;
  resource_name: string;
  match_category?: string;
  gaps_source?: 'STORED' | 'LIVE_LEGACY';
  gaps: SkillGap[];
  learning_recommendations: LearningRecommendation[];
  note?: string | null;
}

export interface ReviewRequest {
  review_status: ReviewStatus;
  review_comments: string;
}

// ---------- Dashboard and audit ----------
// Distributions may come as a map ({"EXCELLENT": 3}) or a list; see toCounts() in shared/labels.
export type CountData = Record<string, number> | Array<Record<string, string | number | null>>;

export interface DashboardSummary {
  total_employees: number;
  open_requirements: number;
  pending_decisions: number;
  available_employees: number;
  matches_by_category?: CountData | null;
  decisions_by_type?: CountData | null;
  runs_by_status?: CountData | null;
  recent_runs?: MatchingRun[] | null;
}

export interface AuditLog {
  audit_log_id?: number;
  id?: number;
  entity_name?: string | null;
  entity?: string | null;
  record_id?: number | string | null;
  action?: string | null;
  action_type?: string | null;
  performed_by?: string | null;
  action_by?: string | null;
  username?: string | null;
  action_timestamp?: string | null;
  details?: string | null;
}

// ---------- Home: pending decisions and bench skills (all fields optional) ----------
export interface PendingDecisionItem {
  matching_result_id?: number | null;
  requirement_id?: number | null;
  employee_id?: number | null;
  employee_code?: string | null;
  employee_name?: string | null;
  designation?: string | null;
  role_name?: string | null;
  project_name?: string | null;
  score?: number | null;
  status?: string | null; // SHORTLISTED | APPROVED_PENDING
}

export interface PendingDecisionsResponse {
  total?: number | null;
  oldest_waiting_days?: number | null;
  items?: PendingDecisionItem[] | null;
}

export interface BenchSkill {
  skill_name?: string | null;
  skill?: string | null;
  name?: string | null;
  count?: number | null;
  employee_count?: number | null;
  available_count?: number | null;
}

// Either a bare list or an object wrapping one.
export type BenchSkillsResponse = BenchSkill[] | { items?: BenchSkill[] | null; skills?: BenchSkill[] | null };
