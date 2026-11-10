import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from '../api.config';
import { Department, Designation, Skill } from '../models/employee.model';

// Lookup lists used to fill the dropdowns.
@Injectable({ providedIn: 'root' })
export class MasterDataService {
  private http = inject(HttpClient);

  getDesignations(): Observable<Designation[]> {
    return this.http.get<Designation[]>(`${API_URL}/designations`);
  }

  getDepartments(): Observable<Department[]> {
    return this.http.get<Department[]>(`${API_URL}/departments`);
  }

  getSkills(): Observable<Skill[]> {
    return this.http.get<Skill[]>(`${API_URL}/skills`);
  }
}
