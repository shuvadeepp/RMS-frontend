// Skill evidence, rematch and before/after comparison (snake_case, like the backend).
import { EvidenceType, GapPriority, GapType, RunTrigger } from './requirement.model';

export interface EvidenceRequest {
  evidence_type: EvidenceType;
  evidence_title: string;
  evidence_description?: string | null;
  score?: number | null;
  maximum_score?: number | null;
  evidence_date?: string | null; // yyyy-MM-dd
  valid_until?: string | null;
  file_reference?: string | null;
  new_proficiency?: number | null;
  mark_completed?: boolean;
}

export interface EvidenceRecord {
  evidence_id: number;
  evidence_type: EvidenceType;
  evidence_title: string;
  evidence_description?: string | null;
  score?: number | null;
  maximum_score?: number | null;
  evidence_date?: string | null;
  valid_until?: string | null;
  file_reference?: string | null;
  verification_status: string;
}

export interface EmployeeSkillState {
  proficiency: number | null;
  validation_status: string | null;
  information_source: string | null;
}

export interface EvidenceResponse {
  evidence: EvidenceRecord;
  employee_skill: {
    employee_skill_id: number;
    employee_id: number;
    skill_name: string | null;
    created: boolean;
    changed: boolean;
    old: EmployeeSkillState;
    new: EmployeeSkillState;
  };
  learning_recommendation: { learning_recommendation_id: number; review_status: string; completed_at: string | null };
  next_step: string;
}

export interface RematchRequest {
  run_trigger?: 'REMATCH_AFTER_LEARNING' | 'MANUAL_REMATCH';
  previous_run_id?: number | null;
  rematch_note?: string | null;
  designation?: string | null;
  department?: string | null;
}

export interface RematchResponse {
  status: string;
  run_status: string;
  requirement_id: number;
  matching_run_id: number;
  previous_run_id: number;
  run_trigger: RunTrigger;
  employees_sent: number;
  message: string;
  result_count?: number;
}

export interface CompareRun {
  matching_run_id: number;
  run_trigger: RunTrigger;
  run_status: string;
  execution_date: string | null;
  completed_at: string | null;
  previous_run_id: number | null;
  rematch_note: string | null;
}

export interface GapChange {
  skill_id: number;
  skill_name: string | null;
  status: 'CLOSED' | 'IMPROVED' | 'UNCHANGED' | 'WORSENED' | 'NEW';
  mandatory: boolean;
  required_level: number;
  old_gap_type: GapType | null;
  old_level: number | null;
  new_gap_type: GapType | null;
  new_level: number | null;
  old_priority: GapPriority | null;
  new_priority: GapPriority | null;
}

export interface CompareEmployee {
  employee_id: number;
  employee_code: string;
  resource_name: string;
  only_in: 'NEW_RUN' | 'OLD_RUN' | null;
  old_matching_result_id: number | null;
  new_matching_result_id: number | null;
  old_score: number | null;
  new_score: number | null;
  score_change?: number;
  old_category: string | null;
  new_category: string | null;
  category_changed?: boolean;
  old_rank: number | null;
  new_rank: number | null;
  rank_change?: number | null; // > 0 = moved up
  gaps_comparable?: boolean;
  gap_changes?: GapChange[];
}

export interface RunCompare {
  requirement_id: number;
  new_run: CompareRun;
  old_run: CompareRun;
  summary: {
    employees_compared: number;
    improved: number;
    declined: number;
    unchanged: number;
    average_score_change: number | null;
    gaps_closed: number;
    new_gaps: number;
    only_in_new_run: number;
    only_in_old_run: number;
  };
  employees: CompareEmployee[];
}
