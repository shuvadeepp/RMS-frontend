import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/api.service';
import { GapResources, LearningResource, LearningResourceFilters, LearningResourceRequest } from '../models/learning-catalog.model';

@Injectable({ providedIn: 'root' })
export class LearningCatalogService {
  private api = inject(ApiService);

  list(filters: LearningResourceFilters = {}): Observable<LearningResource[]> {
    return this.api.get<LearningResource[]>('/api/learning-resources', {
      skillId: filters.skillId, approved: filters.approved, active: filters.active, q: filters.q
    });
  }

  get(id: number): Observable<LearningResource> {
    return this.api.get<LearningResource>(`/api/learning-resources/${id}`);
  }

  // 201. A new resource is never approved.
  create(body: LearningResourceRequest): Observable<LearningResource> {
    return this.api.post<LearningResource>('/api/learning-resources', body);
  }

  // Full replace. Changing an approved resource removes its approval (response has `note`).
  update(id: number, body: LearningResourceRequest): Observable<LearningResource> {
    return this.api.put<LearningResource>(`/api/learning-resources/${id}`, body);
  }

  setApproval(id: number, approved: boolean): Observable<LearningResource> {
    return this.api.put<LearningResource>(`/api/learning-resources/${id}/approval`, { approved });
  }

  resourcesForGap(skillGapId: number): Observable<GapResources> {
    return this.api.get<GapResources>(`/api/skill-gaps/${skillGapId}/resources`);
  }
}
