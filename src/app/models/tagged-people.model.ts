// /api/tagged-people uses snake_case. Any field may be null.
export type TagCode = 'FULLY_ALLOCATED' | 'PARTIALLY_ALLOCATED' | 'APPROVED_PENDING';
export type TaggedAllocationStatus = 'PROPOSED' | 'PLANNED' | 'ACTIVE';

// Why an employee is blocked from AI search. Allocation tags carry allocation_*.
// APPROVED_PENDING (AI search results only, never in /api/tagged-people) is informational and
// carries decision_id / matching_result_id; start_date is the approval date.
export interface PersonTag {
  tag: TagCode | string;
  requirement_id?: number | null;
  requirement_code?: string | null;
  role_name?: string | null;
  project_name?: string | null;
  reason?: string | null;
  allocation_id?: number | null;
  allocation_percentage?: number | null;
  allocation_status?: TaggedAllocationStatus | string | null;
  decision_id?: number | null;
  matching_result_id?: number | null;
  start_date?: string | null;
  // null = open-ended.
  end_date?: string | null;
}

// GET /api/tagged-people rows.
export interface TaggedPerson {
  employee_id: number;
  employee_code?: string | null;
  resource_name?: string | null;
  designation?: string | null;
  department?: string | null;
  tags?: PersonTag[] | null;
}

// POST /api/tagged-people/release (ADMIN only). Exactly one of allocation_id / decision_id.
export type ReleaseRequest =
  | { allocation_id: number; reason: string }
  | { decision_id: number; reason: string };

export interface ReleaseResponse {
  status: string;
  message: string;
}

// "tagged_people" inside the POST /api/requirements response.
export interface TaggedSearchPerson {
  employee_id?: number | null;
  employee_code?: string | null;
  resource_name?: string | null;
  window_free_percentage?: number | null;
  tags?: PersonTag[] | null;
}

export interface TaggedPeopleSummary {
  // to null = open-ended.
  window?: { from?: string | null; to?: string | null } | null;
  include_approved_pending?: boolean | null;
  excluded_count?: number | null;
  excluded?: TaggedSearchPerson[] | null;
  // Kept in the results but tagged (e.g. partially allocated).
  included?: TaggedSearchPerson[] | null;
}
