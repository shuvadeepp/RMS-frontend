import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getErrorMessage } from '../../core/error-message';
import {
  CandidateMatch,
  RequiredSkill,
  RequirementRequest,
  RequirementResponse
} from '../../models/requirement.model';
import { MasterDataService } from '../../services/master-data.service';
import { RequirementService } from '../../services/requirement.service';

@Component({
  selector: 'app-requirement-match',
  imports: [FormsModule],
  templateUrl: './requirement-match.component.html'
})
export class RequirementMatchComponent implements OnInit {
  private masterDataService = inject(MasterDataService);
  private requirementService = inject(RequirementService);

  // Dropdown options
  designations: string[] = [];
  departments: string[] = [];
  skills: string[] = [];
  priorities = ['Low', 'Medium', 'High'];

  // Form values
  projectName = '';
  joiningDate = '';
  designation = '';
  department = '';
  minimumExperience: number | null = null;
  headcount: number | null = null;
  priority = '';
  requiredSkills: RequiredSkill[] = [this.newSkillRow()];

  // Result
  response: RequirementResponse | null = null;
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

  addSkillRow(): void {
    this.requiredSkills.push(this.newSkillRow());
  }

  removeSkillRow(index: number): void {
    this.requiredSkills.splice(index, 1);
  }

  hasSelectedSkill(): boolean {
    return this.requiredSkills.some(row => row.skill_name !== '');
  }

  findMatches(): void {
    this.loading = true;
    this.errorMessage = '';
    this.response = null;

    this.requirementService.submitRequirement(this.buildRequest()).subscribe({
      next: response => {
        this.response = response;
        this.loading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage = getErrorMessage(error);
        this.loading = false;
      }
    });
  }

  // Bootstrap colour for the score badge.
  scoreClass(match: CandidateMatch): string {
    if (match.match_score >= 75) return 'text-bg-success';
    if (match.match_score >= 50) return 'text-bg-warning';
    return 'text-bg-secondary';
  }

  // The skill items may be plain strings or objects, so show whichever is present.
  skillLabel(item: any): string {
    if (typeof item === 'string') return item;
    return item?.skill_name ?? item?.name ?? JSON.stringify(item);
  }

  // Only send fields the user filled in.
  private buildRequest(): RequirementRequest {
    const request: RequirementRequest = {
      required_skills: this.requiredSkills.filter(row => row.skill_name !== '')
    };

    if (this.projectName) request.project_name = this.projectName;
    if (this.joiningDate) request.joining_date = this.joiningDate;
    if (this.designation) request.designation = this.designation;
    if (this.department) request.department = this.department;
    if (this.minimumExperience != null) request.minimum_experience_years = this.minimumExperience;
    if (this.headcount != null) request.headcount = this.headcount;
    if (this.priority) request.priority = this.priority;

    return request;
  }

  private newSkillRow(): RequiredSkill {
    return { skill_name: '', mandatory: true, minimum_proficiency: 3 };
  }
}
