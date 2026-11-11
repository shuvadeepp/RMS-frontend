import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/api.service';
import { EvidenceRecord, EvidenceRequest, EvidenceResponse, RematchRequest, RematchResponse, RunCompare } from '../models/evidence-rematch.model';
import { GapFilters, GapList, GapSummary, LearningPathway } from '../models/learning-pathway.model';
import { LearningRecommendation, ReviewRequest, SkillGapReport } from '../models/requirement.model';

// Skill gaps are stored by the backend; learning actions come from the L&K catalog first, then AI or a template.
@Injectable({ providedIn: 'root' })
export class LearningService {
  private api = inject(ApiService);

  getSkillGaps(matchingResultId: number): Observable<SkillGapReport> {
    return this.api.get<SkillGapReport>(`/api/matching-results/${matchingResultId}/skill-gaps`);
  }

  // Never a 500: returns gaps plus a note when the AI cannot help.
  generate(matchingResultId: number): Observable<SkillGapReport> {
    return this.api.post<SkillGapReport>(`/api/matching-results/${matchingResultId}/learning-recommendations/generate`);
  }

  review(recommendationId: number, request: ReviewRequest): Observable<LearningRecommendation> {
    return this.api.put<LearningRecommendation>(`/api/learning-recommendations/${recommendationId}/review`, request);
  }

  // 201. Updates the person's rating when new_proficiency is sent.
  recordEvidence(recommendationId: number, body: EvidenceRequest): Observable<EvidenceResponse> {
    return this.api.post<EvidenceResponse>(`/api/learning-recommendations/${recommendationId}/evidence`, body);
  }

  listEvidence(recommendationId: number): Observable<EvidenceRecord[]> {
    return this.api.get<EvidenceRecord[]>(`/api/learning-recommendations/${recommendationId}/evidence`);
  }

  // Async by default: 202 with a run to poll. Sync (async=false) answers 201 and can take a minute.
  rematch(requirementId: number, body: RematchRequest = {}, async = true): Observable<RematchResponse> {
    return this.api.post<RematchResponse>(`/api/requirements/${requirementId}/rematch`, body, { async });
  }

  compareRuns(runId: number, withRunId?: number | null): Observable<RunCompare> {
    return this.api.get<RunCompare>(`/api/matching-runs/${runId}/compare`, { withRunId });
  }

  getPathway(matchingResultId: number): Observable<LearningPathway> {
    return this.api.get<LearningPathway>(`/api/matching-results/${matchingResultId}/learning-pathway`);
  }

  getEmployeePathway(employeeId: number, requirementId: number, runId?: number | null): Observable<LearningPathway> {
    return this.api.get<LearningPathway>(`/api/employees/${employeeId}/learning-pathway`, { requirementId, runId });
  }

  listGaps(filters: GapFilters = {}): Observable<GapList> {
    return this.api.get<GapList>('/api/skill-gaps', { ...filters });
  }

  gapSummary(filters: GapFilters = {}): Observable<GapSummary> {
    return this.api.get<GapSummary>('/api/skill-gaps/summary', { ...filters });
  }
}
