export interface Skill {
  skill_id: number;
  skill_name: string;
  skill_category: string | null;
}

export interface SkillListItem {
  skill_id: number;
  skill_name: string;
  // Not returned by /api/skills/with-ids today; the service fills it in.
  skill_category?: string | null;
}

// PUT replaces the whole record, so always send both fields.
export interface SkillRequest {
  skill_name: string;
  skill_category?: string | null;
}
