import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ApiError, toApiError } from '../../core/error-message';
import { ToastService } from '../../core/toast.service';
import { Project } from '../../models/employee.model';
import { LearningRecommendation, Requirement, SkillGap, SkillGapReport } from '../../models/requirement.model';
import { LearningService } from '../../services/learning.service';
import { LookupService } from '../../services/lookup.service';
import { RequirementService } from '../../services/requirement.service';
import { ErrorBoxComponent } from '../../shared/error-box.component';
import { IconComponent } from '../../shared/icon.component';
import { initials } from '../../shared/labels';
import { LearningListComponent } from '../../shared/learning-list.component';

@Component({
  selector: 'app-skill-growth',
  imports: [RouterLink, ErrorBoxComponent, IconComponent, LearningListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="row head">
        <div class="spacer">
          <p class="eyebrow">Skill growth</p>
          <h1 class="page-title">Close the gaps</h1>
          <p class="page-sub">What each suggested person still needs to learn for a project, and the learning plan to get there.</p>
        </div>
        <div class="field selector">
          <label for="sg-project">Project</label>
          <select id="sg-project" class="select" #sel (change)="select(sel.value)">
            <option value="">Choose a project</option>
            @for (p of projects() ?? []; track p.projectId) {
              <option [value]="p.projectId" [selected]="p.projectId === projectId()"><strong>{{ p.projectCode }}</strong> - {{ p.projectName }}</option>
            }
          </select>
        </div>
      </header>

      @if (!projectId()) {
        <div class="card state">Choose a project to see skill gaps and learning plans.</div>
      } @else if (requirements() === null) {
        <div class="card state" role="status"><span class="spinner"></span> Loading...</div>
      } @else if (!requirementId()) {
        <div class="card state empty">
          <span>No AI matching has been run for this project yet.</span>
          <a class="btn btn-primary btn-sm" routerLink="/find-people"><app-icon name="sparkle" [size]="16" /> Find people</a>
        </div>
      } @else if (loading()) {
        <div class="card state" role="status"><span class="spinner"></span> Loading skill gaps...</div>
      } @else if (error()) {
        <app-error-box [error]="error()!" (retry)="load(requirementId()!)" />
      } @else if (reports().length === 0) {
        <div class="card state">No AI suggestions saved for this project yet.</div>
      } @else {
        <div class="grid grid-2">
          @for (r of reports(); track r.matching_result_id) {
            <article class="card growth" [attr.aria-labelledby]="'sg-' + r.matching_result_id">
              <div class="row">
                <span class="avatar" aria-hidden="true">{{ initials(r.resource_name) }}</span>
                <div class="list-main">
                  <h2 class="list-title" [id]="'sg-' + r.matching_result_id">
                    <a [routerLink]="['/candidate', r.matching_result_id]" [queryParams]="{ requirementId: requirementId() }">{{ r.resource_name }}</a>
                  </h2>
                  <p class="muted small">{{ r.employee_code }}</p>
                </div>
              </div>

              <div class="chip-list">
                <span class="chip-list-label">Gaps:</span>
                @for (g of r.gaps; track g.skill_name) {
                  <span class="chip chip-needs">{{ gapLabel(g) }}</span>
                } @empty { <span class="pill pill-success">No gaps</span> }
              </div>

              @if (r.learning_recommendations.length) {
                <app-learning-list [items]="r.learning_recommendations" (changed)="onChanged(r.matching_result_id, $event)" />
              } @else if (r.gaps.length) {
                <div class="state empty">
                  <span>No learning plan yet.</span>
                  <button type="button" class="btn btn-primary btn-sm" [disabled]="generating() === r.matching_result_id" (click)="generate(r.matching_result_id)">
                    @if (generating() === r.matching_result_id) { <span class="spinner"></span> } @else { <app-icon name="sparkle" [size]="16" /> }
                    Generate with AI
                  </button>
                </div>
              }
            </article>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .head { align-items: flex-end; }
    .selector { width: 380px; max-width: 100%; }
    /* Lets options show the bold code where the browser supports styled selects; others show plain text. */
    .selector .select, .selector .select::picker(select) { appearance: base-select; }
    .selector .select::picker(select) {
      border: 1px solid var(--border); border-radius: 12px; padding: 6px; max-height: 320px;
      background: var(--card); box-shadow: 0 12px 32px rgba(15, 23, 42, .14);
    }
    .selector option { padding: 8px 10px; border-radius: 8px; font-size: 14px; }
    .selector option:hover, .selector option:focus-visible { background: var(--primary-tint); }
    .selector option::checkmark { display: none; }
    .selector strong { font-weight: 800; }
    .growth { display: flex; flex-direction: column; gap: 14px; }
    .growth h2 { font-size: 16px; }
    .growth h2 a { color: var(--ink); }
    .empty { justify-content: space-between; flex-wrap: wrap; }
  `
})
export class SkillGrowthComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private requirementsApi = inject(RequirementService);
  private learning = inject(LearningService);
  private toast = inject(ToastService);
  private lookups = inject(LookupService);

  readonly projects = toSignal(
    this.lookups.getProjects().pipe(catchError(() => of<Project[]>([]))),
    { initialValue: null }
  );
  readonly requirements = toSignal(
    this.requirementsApi.getRequirements().pipe(catchError(() => of<Requirement[]>([]))),
    { initialValue: null }
  );
  readonly projectId = signal<number | null>(null);
  // Skill gaps belong to a requirement; use the project's latest one.
  readonly requirementId = computed(() => {
    const project = (this.projects() ?? []).find(p => p.projectId === this.projectId());
    if (!project) return null;
    const ids = (this.requirements() ?? [])
      .filter(r => r.project_id === project.projectId || (!r.project_id && r.project_name === project.projectName))
      .map(r => r.requirement_id);
    return ids.length ? Math.max(...ids) : null;
  });
  readonly reports = signal<SkillGapReport[]>([]);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly generating = signal<number | null>(null);

  readonly initials = initials;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.projectId.set(Number(params.get('projectId')) || null);
    });
    effect(() => {
      const id = this.requirementId();
      untracked(() => {
        this.reports.set([]);
        if (id) this.load(id);
      });
    });
  }

  select(value: string): void {
    this.router.navigate([], { queryParams: { projectId: value || null } });
  }

  load(id: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.requirementsApi.getSkillGaps(id).subscribe({
      next: list => {
        this.reports.set((list ?? []).map(r => ({ ...r, gaps: r.gaps ?? [], learning_recommendations: r.learning_recommendations ?? [] })));
        this.loading.set(false);
      },
      error: err => {
        this.error.set(toApiError(err));
        this.loading.set(false);
      }
    });
  }

  gapLabel(g: SkillGap): string {
    if (!g.current_level) return `${g.skill_name} · missing, needs ${g.required_level ?? '?'}`;
    return `${g.skill_name} · ${g.current_level} of ${g.required_level ?? '?'}`;
  }

  onChanged(matchingResultId: number, updated: LearningRecommendation): void {
    this.reports.update(list => list.map(r => r.matching_result_id !== matchingResultId ? r : {
      ...r,
      learning_recommendations: r.learning_recommendations.map(x =>
        x.learning_recommendation_id === updated.learning_recommendation_id ? updated : x
      )
    }));
  }

  generate(matchingResultId: number): void {
    this.generating.set(matchingResultId);
    this.learning.generate(matchingResultId).subscribe({
      next: res => {
        this.generating.set(null);
        if (res?.note) this.toast.info(res.note);
        // Reload this person's report to pick up the new recommendations.
        this.learning.getSkillGaps(matchingResultId).subscribe({
          next: fresh => this.reports.update(list => list.map(r => (r.matching_result_id === matchingResultId
            ? { ...fresh, gaps: fresh.gaps ?? [], learning_recommendations: fresh.learning_recommendations ?? [] }
            : r)))
        });
      },
      error: err => {
        this.generating.set(null);
        this.toast.error(`Could not generate a learning plan: ${toApiError(err).title}`);
      }
    });
  }
}
