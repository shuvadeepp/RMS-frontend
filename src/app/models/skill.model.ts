export interface Skill {
  skill_id: number;
  skill_name: string;
  skill_category: string | null;
}

export interface SkillListItem {
  skill_id: number;
  skill_name: string;
}

// PUT replaces the whole record, so always send both fields.
export interface SkillRequest {
  skill_name: string;
  skill_category?: string | null;
}
