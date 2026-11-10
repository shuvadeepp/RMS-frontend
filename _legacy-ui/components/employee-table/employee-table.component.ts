import { Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Employee } from '../../models/employee.model';

// Reusable table, used by both the "All Employees" and "Search" pages.
@Component({
  selector: 'app-employee-table',
  imports: [DatePipe],
  templateUrl: './employee-table.component.html'
})
export class EmployeeTableComponent {
  employees = input.required<Employee[]>();
}
