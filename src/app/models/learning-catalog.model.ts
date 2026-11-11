// L&K learning-resource catalog (snake_case, like the backend).
import { GapType, ResourceType, ValidationMethod } from './requirement.model';

export interface LearningResource {
  learning_resource_id: number;
  skill_id: number;
  skill_name: string | null;
  resource_title: string;
  resource_type: ResourceType;
  provider: string | null;
  resource_url: string | null;
  resource_description: string | null;
  from_proficiency: number;
  to_proficiency: number;
  estimated_hours: number | null;
  estimated_weeks: number | null;
  validation_method: ValidationMethod;
  is_approved: boolean;
  approved_by: number | null;
  approved_at: string | null;
  is_active: boolean;
  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  note?: string; // present on PUT when approval was removed
}

export interface LearningResourceRequest {
  skill_id: number;
  resource_title: string;
  resource_type?: ResourceType;
  provider?: string | null;
  resource_url?: string | null;
  resource_description?: string | null;
  from_proficiency?: number;
  to_proficiency: number;
  estimated_hours?: number | null;
  validation_method?: ValidationMethod;
  is_active?: boolean;
}

export interface LearningResourceFilters {
  skillId?: number | null;
  approved?: boolean | null;
  active?: boolean | null;
  q?: string | null;
}

export interface GapResources {
  skill_gap_id: number;
  skill_id: number;
  skill_name: string | null;
  gap_type: GapType;
  current_level: number | null;
  required_level: number;
  resources: LearningResource[];
  note?: string;
}
