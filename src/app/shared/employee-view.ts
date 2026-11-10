import { Employee } from '../models/employee.model';
import { RawEmployee } from '../models/requirement.model';

// One display shape for employees from /getEmployees (camelCase) and the requirements response (either casing).
export interface EmployeeView {
  code: string;
  name: string;
  designation: string;
  department: string;
  experience: number | null;
  availability: string | null;
  capacity: number | null;
  availableFrom: string | null;
  skills: Array<{ name: string; level: number }>;
}

export function fromEmployee(e: Employee): EmployeeView {
  return {
    code: e.employeeCode,
    name: e.name,
    designation: e.designation ?? '',
    department: e.department ?? '',
    experience: e.totalExperienceYears ?? null,
    availability: e.availabilityStatus ?? null,
    capacity: e.availableCapacityPercentage ?? null,
    availableFrom: e.availableFrom ?? null,
    skills: (e.skills ?? []).map(s => ({ name: s.name, level: s.proficiency }))
  };
}

export function fromRawEmployee(e: RawEmployee): EmployeeView {
  return {
    code: e.employeeCode ?? e.employee_code ?? '',
    name: e.name ?? e.resource_name ?? '',
    designation: e.designation ?? '',
    department: e.department ?? '',
    experience: e.totalExperienceYears ?? e.total_experience_years ?? null,
    availability: e.availabilityStatus ?? e.availability_status ?? e.availability ?? null,
    capacity: e.availableCapacityPercentage ?? e.available_capacity_percentage ?? null,
    availableFrom: null,
    skills: (e.skills ?? []).map(s => ({ name: s.name ?? s.skill_name ?? '', level: s.proficiency ?? s.proficiency_level ?? 0 }))
  };
}
