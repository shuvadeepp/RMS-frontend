import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Employee, EmployeeSearchFilters } from '../models/employee.model';

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private api = inject(ApiService);

  getAllEmployees(): Observable<Employee[]> {
    return this.api.get<Employee[]>('/api/getEmployees');
  }

  // {id} is the numeric employee id.
  getEmployee(id: number): Observable<Employee> {
    return this.api.get<Employee>(`/api/employees/${id}`);
  }

  // Filtered list, no AI. Skills repeat: ?skills=Java&skills=Angular
  searchEmployees(filters: EmployeeSearchFilters): Observable<Employee[]> {
    return this.api.get<Employee[]>('/api/employees/search', {
      designation: filters.designation,
      department: filters.department,
      minExperience: filters.minExperience,
      skills: filters.skills ?? []
    });
  }
}
