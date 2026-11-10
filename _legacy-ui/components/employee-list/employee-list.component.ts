import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { getErrorMessage } from '../../core/error-message';
import { Employee } from '../../models/employee.model';
import { EmployeeService } from '../../services/employee.service';
import { EmployeeTableComponent } from '../employee-table/employee-table.component';

@Component({
  selector: 'app-employee-list',
  imports: [EmployeeTableComponent],
  templateUrl: './employee-list.component.html'
})
export class EmployeeListComponent implements OnInit {
  private employeeService = inject(EmployeeService);

  employees: Employee[] = [];
  loading = false;
  errorMessage = '';

  ngOnInit(): void {
    this.loadEmployees();
  }

  loadEmployees(): void {
    this.loading = true;
    this.errorMessage = '';

    this.employeeService.getAllEmployees().subscribe({
      next: employees => {
        this.employees = employees;
        this.loading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = getErrorMessage(error);
        this.loading = false;
      }
    });
  }
}
