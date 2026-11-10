import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getErrorMessage } from '../../core/error-message';
import { Employee, EmployeeSearchFilters } from '../../models/employee.model';
import { EmployeeService } from '../../services/employee.service';
import { MasterDataService } from '../../services/master-data.service';
import { EmployeeTableComponent } from '../employee-table/employee-table.component';

@Component({
  selector: 'app-employee-search',
  imports: [FormsModule, EmployeeTableComponent],
  templateUrl: './employee-search.component.html',
  styleUrl: './employee-search.component.css'
})
export class EmployeeSearchComponent implements OnInit {
  private employeeService = inject(EmployeeService);
  private masterDataService = inject(MasterDataService);

  // Dropdown options
  designations: string[] = [];
  departments: string[] = [];
  skills: string[] = [];

  // Selected filters
  filters: EmployeeSearchFilters = this.emptyFilters();

  // Results
  employees: Employee[] = [];
  searched = false;
  loading = false;
  errorMessage = '';

  ngOnInit(): void {
    this.masterDataService.getDesignations().subscribe({
      next: list => this.designations = list.map(d => d.designationName),
      error: (error: HttpErrorResponse) => this.errorMessage = getErrorMessage(error)
    });
    this.masterDataService.getDepartments().subscribe({
      next: list => this.departments = list.map(d => d.departmentName),
      error: (error: HttpErrorResponse) => this.errorMessage = getErrorMessage(error)
    });
    this.masterDataService.getSkills().subscribe({
      next: list => this.skills = list.map(s => s.skillName),
      error: (error: HttpErrorResponse) => this.errorMessage = getErrorMessage(error)
    });
  }

  isSkillSelected(skill: string): boolean {
    return this.filters.skills!.includes(skill);
  }

  toggleSkill(skill: string): void {
    if (this.isSkillSelected(skill)) {
      this.filters.skills = this.filters.skills!.filter(s => s !== skill);
    } else {
      this.filters.skills = [...this.filters.skills!, skill];
    }
  }

  search(): void {
    this.loading = true;
    this.errorMessage = '';

    this.employeeService.searchEmployees(this.filters).subscribe({
      next: employees => {
        this.employees = employees;
        this.searched = true;
        this.loading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = getErrorMessage(error);
        this.loading = false;
      }
    });
  }

  reset(): void {
    this.filters = this.emptyFilters();
    this.employees = [];
    this.searched = false;
    this.errorMessage = '';
  }

  private emptyFilters(): EmployeeSearchFilters {
    return { designation: '', department: '', minExperience: null, skills: [] };
  }
}
