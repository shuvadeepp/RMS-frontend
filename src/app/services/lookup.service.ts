import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Department, Designation, Project, Skill } from '../models/employee.model';

// Lookup lists for dropdowns. They have no ids, so dropdowns use the names.
@Injectable({ providedIn: 'root' })
export class LookupService {
  private api = inject(ApiService);

  private designations$?: Observable<Designation[]>;
  private departments$?: Observable<Department[]>;
  private skills$?: Observable<Skill[]>;

  getDesignations(): Observable<Designation[]> {
    return this.designations$ ??= this.api.get<Designation[]>('/api/designations').pipe(shareReplay(1));
  }

  getDepartments(): Observable<Department[]> {
    return this.departments$ ??= this.api.get<Department[]>('/api/departments').pipe(shareReplay(1));
  }

  getSkills(): Observable<Skill[]> {
    return this.skills$ ??= this.api.get<Skill[]>('/api/skills').pipe(shareReplay(1));
  }

  getProjects(): Observable<Project[]> {
    return this.api.get<Project[]>('/api/projects');
  }
}
