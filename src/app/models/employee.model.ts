// Employees and lookups use camelCase.
export type AvailabilityStatus = 'BENCH' | 'PARTIALLY_AVAILABLE' | 'ALLOCATED' | 'UNAVAILABLE';

export interface EmployeeSkill {
  name: string;
  proficiency: number;
  experienceYears: number;
}

export interface Employee {
  // snake_case on /getEmployees, /employees/{id} and /employees/search, like /matches.
  // Needed for /employees/{id} and allocations.
  employee_id: number;
  employeeCode: string;
  name: string;
  designation: string;
  department: string;
  totalExperienceYears: number;
  skills: EmployeeSkill[];
  availabilityStatus: AvailabilityStatus | string;
  availableFrom: string | null;
  availableCapacityPercentage: number | null;
}

// Filters for GET /api/employees/search. Every field is optional.
export interface EmployeeSearchFilters {
  designation?: string;
  department?: string;
  minExperience?: number | null;
  skills?: string[];
}

export interface Designation {
  designationName: string;
}

export interface Department {
  departmentName: string;
}

export interface Skill {
  skillName: string;
}

// From /api/skills/with-ids (the plain /api/skills list has no ids).
export interface SkillWithId {
  skill_id: number;
  skill_name: string;
}

export interface Project {
  projectId: number;
  projectCode: string;
  projectName: string;
  projectStatus: string;
  startDate: string | null;
  endDate: string | null;
}
