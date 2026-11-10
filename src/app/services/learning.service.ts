import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/api.service';
import { LearningRecommendation, ReviewRequest, SkillGapReport } from '../models/requirement.model';

// Skill gaps are computed by the backend; learning actions are written by the AI.
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
}
