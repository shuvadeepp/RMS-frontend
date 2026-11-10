import { HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../core/api.service';
import {
  AuditLog,
  DashboardSummary,
  MatchResult,
  MatchingRun,
  Requirement,
  RequirementCreateResponse,
  RequirementRequest,
  SkillGapReport,
  SkillRef
} from '../models/requirement.model';

// Rule-scored results ("scored_by": "RULES") use match_score / category and top-level skill lists.
type RawMatch = MatchResult & {
  match_score?: number | null;
  category?: string | null;
  matching_skills?: SkillRef[];
  transferable_skills?: SkillRef[];
  missing_skills?: SkillRef[];
  below_required_proficiency?: SkillRef[];
};

function normalizeMatch(m: RawMatch): MatchResult {
  return {
    ...m,
    overall_score: m.overall_score ?? m.match_score ?? 0,
    match_category: m.match_category ?? m.category ?? '',
    recommendation_status: m.recommendation_status ?? 'REVIEW_REQUIRED',
    strengths: m.strengths ?? { matching_skills: m.matching_skills ?? [], transferable_skills: m.transferable_skills ?? [] },
    skill_gaps: m.skill_gaps ?? { missing_skills: m.missing_skills ?? [], below_required_proficiency: m.below_required_proficiency ?? [] }
  };
}

@Injectable({ providedIn: 'root' })
export class RequirementService {
  private api = inject(ApiService);

  // Always async: a full request returns 202 with a run to poll; filters/preview return 200.
  createRequirement(request: RequirementRequest): Observable<RequirementCreateResponse> {
    return this.api.post<RequirementCreateResponse>('/api/requirements', request, { async: true });
  }

  getRun(runId: number): Observable<MatchingRun> {
    return this.api.get<MatchingRun>(`/api/matching-runs/${runId}`);
  }

  getRequirements(): Observable<Requirement[]> {
    return this.api.get<Requirement[]>('/api/requirements');
  }

  getRequirement(id: number): Observable<Requirement> {
    return this.api.get<Requirement>(`/api/requirements/${id}`);
  }

  // Latest run unless runId is given. Includes current_decision per match.
  getMatches(requirementId: number, runId?: number | null): Observable<MatchResult[]> {
    return this.api
      .get<RawMatch[]>(`/api/requirements/${requirementId}/matches`, { runId })
      .pipe(map(list => (list ?? []).map(normalizeMatch)));
  }

  getSkillGaps(requirementId: number): Observable<SkillGapReport[]> {
    return this.api.get<SkillGapReport[]>(`/api/requirements/${requirementId}/skill-gaps`);
  }

  exportMatches(requirementId: number): Observable<HttpResponse<Blob>> {
    return this.api.getBlob(`/api/requirements/${requirementId}/matches/export`);
  }

  getDashboardSummary(): Observable<DashboardSummary> {
    return this.api.get<DashboardSummary>('/api/dashboard/summary');
  }

  getAuditLogs(limit = 50, entity?: string, recordId?: number): Observable<AuditLog[]> {
    return this.api.get<AuditLog[]>('/api/audit-logs', { limit, entity, recordId });
  }
}

export function requirementStatusOf(requirement: Requirement): string {
  return requirement.requirement_status ?? requirement.status ?? 'OPEN';
}
