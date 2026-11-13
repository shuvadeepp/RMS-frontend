import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, mergeMap, of, switchMap, toArray } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Skill, SkillListItem, SkillRequest } from '../models/skill.model';

// Skill CRUD. Reads: any role. Create, update, delete: ADMIN and LK_ADMIN.
@Injectable({ providedIn: 'root' })
export class SkillService {
  private api = inject(ApiService);

  // Not cached, so the table always shows the latest after an edit.
  // If the backend list has no category yet, load each skill (a few at a time) to get it.
  list(): Observable<SkillListItem[]> {
    return this.api.get<SkillListItem[]>('/api/skills/with-ids').pipe(
      switchMap(items => {
        if (items.length === 0 || items.every(i => i.skill_category !== undefined)) {
          return of(items);
        }
        return from(items).pipe(
          mergeMap(item => this.get(item.skill_id).pipe(
            map(full => ({ ...item, skill_category: full.skill_category })),
            catchError(() => of({ ...item, skill_category: null }))
          ), 6),
          toArray(),
          map(done => items.map(i => done.find(d => d.skill_id === i.skill_id) ?? i))
        );
      })
    );
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
