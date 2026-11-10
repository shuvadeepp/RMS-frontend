import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiError, toApiError } from '../../core/error-message';
import { Project } from '../../models/employee.model';
import { Requirement } from '../../models/requirement.model';
import { LookupService } from '../../services/lookup.service';
import { RequirementService, requirementStatusOf } from '../../services/requirement.service';
import { ErrorBoxComponent } from '../../shared/error-box.component';
import { IconComponent } from '../../shared/icon.component';
import { formatDate, humanise, statusPill } from '../../shared/labels';

@Component({
  selector: 'app-projects',
  imports: [RouterLink, IconComponent, ErrorBoxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="row">
        <div class="spacer">
          <p class="eyebrow">Projects</p>
          <h1 class="page-title">Projects and their needs</h1>
        </div>
        <a class="btn btn-primary" routerLink="/find-people"><app-icon name="sparkle" [size]="18" /> New need</a>
      </header>

      <!-- "People needed" section hidden for now.
      <section class="card" aria-labelledby="req-title">
        <h2 id="req-title" class="section-title head">People needed</h2>
        @if (requirements() === null) {
          <div class="state" role="status"><span class="spinner"></span> Loading...</div>
        } @else if (requirementsError()) {
          <app-error-box [error]="requirementsError()!" (retry)="loadRequirements()" />
        } @else if (requirements()!.length === 0) {
          <div class="state">No needs saved yet. Start with Find People (AI).</div>
        } @else {
          <ul class="list">
            @for (r of requirements(); track r.requirement_id) {
              <li class="list-item">
                <div class="list-main">
                  <p class="list-title">{{ r.project_name || 'Requirement #' + r.requirement_id }}</p>
                  <p class="muted small">
                    {{ skillsLine(r) }}
                    @if (r.joining_date) { · from {{ formatDate(r.joining_date) }} }
                  </p>
                </div>
                <span class="pill" [class]="statusPill(statusOf(r))">{{ humanise(statusOf(r)) }}</span>
                <a class="btn btn-sm" routerLink="/find-people" [queryParams]="{ requirementId: r.requirement_id }">Find people</a>
                <a class="btn btn-sm" routerLink="/decisions" [queryParams]="{ requirementId: r.requirement_id }">See matches</a>
              </li>
            }
          </ul>
        }
      </section>
      -->

      <h2 class="section-title">All projects</h2>
      @if (projects() === null) {
        <div class="card state" role="status"><span class="spinner"></span> Loading projects...</div>
      } @else if (projectsError()) {
        <app-error-box [error]="projectsError()!" (retry)="loadProjects()" />
      } @else if (projects()!.length === 0) {
        <div class="card state">No projects found.</div>
      } @else {
        <ul class="summary" aria-label="Projects by status">
          @for (s of statusCounts(); track s.status) {
            <li class="pill" [class]="statusPill(s.status)">{{ s.count }} {{ humanise(s.status) }}</li>
          }
        </ul>

        <ul class="tiles" aria-label="All projects">
          @for (p of projects(); track p.projectId) {
            <li class="card tile-card">
              <div class="tile-top">
                <span class="code">{{ p.projectCode }}</span>
                <span class="pill" [class]="statusPill(p.projectStatus)">{{ humanise(p.projectStatus) }}</span>
              </div>
              <h2 class="name">{{ p.projectName }}</h2>
              <p class="dates muted small">
                <app-icon name="calendar" [size]="16" />
                @if (p.startDate) {
                  {{ formatDate(p.startDate) }}
                  @if (p.endDate) { – {{ formatDate(p.endDate) }} }
                } @else { Dates not set }
              </p>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .head { margin-bottom: 14px; }
    .summary { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .summary .pill { font-size: 13px; padding: 6px 12px; }
    .tiles {
      list-style: none; margin: 0; padding: 0;
      display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    }
    .tile-card { display: flex; flex-direction: column; gap: 10px; }
    .tile-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .code { font-size: 12px; font-weight: 800; letter-spacing: .06em; color: var(--primary-dark); }
    .name { font-size: 17px; font-weight: 800; line-height: 1.3; flex: 1; }
    .dates { display: flex; align-items: center; gap: 6px; }
  `
})
export class ProjectsComponent implements OnInit {
  private lookups = inject(LookupService);
  private requirementsApi = inject(RequirementService);

  readonly projects = signal<Project[] | null>(null);
  readonly projectsError = signal<ApiError | null>(null);
  readonly requirements = signal<Requirement[] | null>(null);
  readonly requirementsError = signal<ApiError | null>(null);
  readonly statusOf = requirementStatusOf;

  readonly statusCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.projects() ?? []) {
      counts.set(p.projectStatus, (counts.get(p.projectStatus) ?? 0) + 1);
    }
    return [...counts].map(([status, count]) => ({ status, count }));
  });

  readonly statusPill = statusPill;
  readonly humanise = humanise;
  readonly formatDate = formatDate;

  ngOnInit(): void {
    this.loadProjects();
    // this.loadRequirements(); // "People needed" section is hidden
  }

  loadRequirements(): void {
    this.requirements.set(null);
    this.requirementsError.set(null);
    this.requirementsApi.getRequirements().subscribe({
      next: list => this.requirements.set([...list].sort((a, b) => b.requirement_id - a.requirement_id)),
      error: err => { this.requirements.set([]); this.requirementsError.set(toApiError(err)); }
    });
  }

  skillsLine(r: Requirement): string {
    return (r.required_skills ?? []).map(s => `${s.skill_name} ${s.minimum_proficiency}+`).join(', ') || 'No skills listed';
  }

  loadProjects(): void {
    this.projects.set(null);
    this.projectsError.set(null);
    this.lookups.getProjects().subscribe({
      next: list => this.projects.set(list),
      error: err => { this.projects.set([]); this.projectsError.set(toApiError(err)); }
    });
  }
}
