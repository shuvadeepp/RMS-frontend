import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Skill, SkillListItem, SkillRequest } from '../models/skill.model';

// Skill CRUD. Reads: any role. Create, update, delete: ADMIN and LK_ADMIN.
@Injectable({ providedIn: 'root' })
export class SkillService {
  private api = inject(ApiService);

  // Not cached, so the table always shows the latest after an edit.
  list(): Observable<SkillListItem[]> {
    return this.api.get<SkillListItem[]>('/api/skills/with-ids');
  }

  get(id: number): Observable<Skill> {
    return this.api.get<Skill>(`/api/skills/${id}`);
  }

  create(body: SkillRequest): Observable<Skill> {
    return this.api.post<Skill>('/api/skills', body);
  }

  update(id: number, body: SkillRequest): Observable<Skill> {
    return this.api.put<Skill>(`/api/skills/${id}`, body);
  }

  delete(id: number): Observable<void> {
    return this.api.delete<void>(`/api/skills/${id}`);
  }
}
