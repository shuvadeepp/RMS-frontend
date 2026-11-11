import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ApiError, toApiError } from '../../core/error-message';
import { ToastService } from '../../core/toast.service';
import { Project } from '../../models/employee.model';
import { GapPriority, GapType, LearningRecommendation, MatchingRun, Requirement, SkillGap, SkillGapReport } from '../../models/requirement.model';
import { GapResources } from '../../models/learning-catalog.model';
import { GapListItem } from '../../models/learning-pathway.model';
import { AuthService } from '../../services/auth.service';
import { LearningCatalogService } from '../../services/learning-catalog.service';
import { LearningService } from '../../services/learning.service';
import { LookupService } from '../../services/lookup.service';
import { RequirementService } from '../../services/requirement.service';
import { ErrorBoxComponent } from '../../shared/error-box.component';
import { IconComponent } from '../../shared/icon.component';
import { GENERATE_ROLES, PRIORITY_ORDER, humanise, initials, isRematch, priorityInfo, priorityRank, sourceInfo } from '../../shared/labels';
import { LearningListComponent } from '../../shared/learning-list.component';
import { LearningPathwayComponent } from '../../shared/learning-pathway.component';
import { RematchButtonComponent } from '../../shared/rematch-button.component';

@Component({
  selector: 'app-skill-growth',
  imports: [RouterLink, ErrorBoxComponent, IconComponent, LearningListComponent, LearningPathwayComponent, RematchButtonComponent],
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
        @if (requirementId()) { <app-rematch-button [requirementId]="requirementId()" /> }
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
        <div class="row filters">
          @if (run(); as rn) {
            <span class="muted small">Run {{ rn.matching_run_id }}</span>
            @if (isRematch(rn.run_trigger)) {
              <span class="pill pill-info" [attr.title]="rn.rematch_note">Rematch</span>
              @if (rn.previous_run_id) { <span class="muted small">replaces run {{ rn.previous_run_id }}</span> }
            }
            @if (rn.previous_run_id) {
              <a class="btn btn-sm" [routerLink]="['/compare', rn.matching_run_id]">Compare with previous run</a>
            }
          }
          <span class="spacer"></span>
          <div class="field">
            <label for="sg-prio">Priority</label>
            <select id="sg-prio" class="select" #pf (change)="priorityFilter.set(pf.value); loadList()">
              <option value="">All</option>
              @for (p of priorities; track p) { <option [value]="p" [selected]="priorityFilter() === p">{{ priorityInfo(p).label }}</option> }
            </select>
          </div>
          @if (listView()) {
            <div class="field">
              <label for="sg-type">Gap type</label>
              <select id="sg-type" class="select" #tf (change)="gapTypeFilter.set(tf.value); loadList()">
                <option value="">All</option><option value="MISSING">Missing</option><option value="BELOW_REQUIRED">Below required level</option>
              </select>
            </div>
            <div class="field">
              <label for="sg-rec">Learning plan</label>
              <select id="sg-rec" class="select" #rf (change)="recFilter.set(rf.value); loadList()">
                <option value="">All</option><option value="true">Has a plan</option><option value="false">No plan yet</option>
              </select>
            </div>
          }
          <label class="check"><input type="checkbox" [checked]="mandatoryOnly()" (change)="mandatoryOnly.set(!mandatoryOnly()); loadList()" /> Mandatory only</label>
          <button type="button" class="btn btn-sm" (click)="toggleListView()">{{ listView() ? 'Card view' : 'List view' }}</button>
        </div>

        @if (listView()) {
          @if (listLoading()) {
            <div class="card state" role="status"><span class="spinner"></span> Loading...</div>
          } @else if (listError()) {
            <app-error-box [error]="listError()!" (retry)="loadList()" />
          } @else if (sortedList().length === 0) {
            <div class="card state">No gaps match the filters.</div>
          } @else {
            <div class="card table-wrap">
              <table class="gap-table">
                <caption class="sr-only">Skill gaps</caption>
                <thead>
                  <tr>
                    @for (c of listColumns; track c.key) {
                      <th scope="col"><button type="button" class="th-btn" (click)="sortBy(c.key)">{{ c.label }}{{ sortKey() === c.key ? (sortDesc() ? ' ▼' : ' ▲') : '' }}</button></th>
                    }
                    <th scope="col">Plans</th>
                  </tr>
                </thead>
                <tbody>
                  @for (g of sortedList(); track g.skill_gap_id) {
                    <tr>
                      <td><span class="pill" [class]="priorityInfo(g.priority).css" [attr.title]="g.priority_reason">{{ priorityInfo(g.priority).label }}</span></td>
                      <td><a [routerLink]="['/candidate', g.matching_result_id]" [queryParams]="{ requirementId: g.requirement_id }">{{ g.resource_name }}</a></td>
                      <td>{{ g.skill_name }}@if (g.mandatory) { <span class="muted small"> · must-have</span> }</td>
                      <td>{{ g.gap_type === 'MISSING' ? 'Missing' : 'Below required' }}</td>
                      <td>{{ g.current_level ?? 'none' }} of {{ g.required_level }}</td>
                      <td>
                        {{ g.learning_recommendation_count }}
                        @for (s of g.recommendation_sources; track s) { <span class="pill" [class]="sourceInfo(s).css" [attr.title]="sourceInfo(s).tip">{{ sourceInfo(s).label }}</span> }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              @if (listTotal() > sortedList().length) {
                <p class="muted small">Showing {{ sortedList().length }} of {{ listTotal() }} gaps.</p>
              }
            </div>
          }
        } @else {
        <div class="grid grid-2">
          @for (r of visibleReports(); track r.matching_result_id) {
            <article class="card growth" [attr.aria-labelledby]="'sg-' + r.matching_result_id">
              <div class="row">
                <span class="avatar" aria-hidden="true">{{ initials(r.resource_name) }}</span>
                <div class="list-main">
                  <h2 class="list-title" [id]="'sg-' + r.matching_result_id">
                    <a [routerLink]="['/candidate', r.matching_result_id]" [queryParams]="{ requirementId: requirementId() }">{{ r.resource_name }}</a>
                  </h2>
                  <p class="muted small">{{ r.employee_code }}</p>
                  @if (r.gaps_source === 'LIVE_LEGACY') {
                    <p class="muted small">Older run: gaps are worked out from current skills.</p>
                  }
                </div>
              </div>

              <div class="chip-list">
                <span class="chip-list-label">Gaps:</span>
                @for (g of filteredGaps(r); track g.skill_name) {
                  <span class="chip" [class]="'chip ' + gapChipClass(g)" [attr.title]="g.priority_reason">{{ gapLabel(g) }}</span>
                } @empty { <span class="pill pill-success">No gaps</span> }
              </div>

              @for (g of filteredGaps(r); track g.skill_name) {
                @if (g.skill_gap_id) {
                  <details class="gap-res" (toggle)="onToggle(g.skill_gap_id, $event)">
                    <summary>Approved resources: {{ g.skill_name }}</summary>
                    @let gr = gapResources()[g.skill_gap_id];
                    @if (gr === 'loading' || !gr) {
                      <p class="muted small"><span class="spinner"></span> Loading...</p>
                    } @else if (gr === 'error') {
                      <p class="muted small">Could not load resources.</p>
                    } @else if (gr.resources.length === 0) {
                      <p class="muted small">{{ gr.note || 'No approved and active L&K resource fits this gap.' }}</p>
                    } @else {
                      <ul class="list">
                        @for (x of gr.resources; track x.learning_resource_id) {
                          <li class="small">
                            <strong>{{ x.resource_title }}</strong>
                            <span class="muted"> · {{ humanise(x.resource_type) }} · level {{ x.from_proficiency }} to {{ x.to_proficiency }}
                              @if (x.estimated_hours) { · {{ x.estimated_hours }} h }</span>
                          </li>
                        }
                      </ul>
                    }
                  </details>
                }
              }

              @if (r.learning_recommendations.length) {
                <app-learning-list [items]="r.learning_recommendations" [requirementId]="requirementId()"(changed)="onChanged(r.matching_result_id, $event)" />
              }
              <div>
                <button type="button" class="btn btn-sm" [attr.aria-expanded]="pathwayOpen().has(r.matching_result_id)" (click)="togglePathway(r.matching_result_id)">
                  {{ pathwayOpen().has(r.matching_result_id) ? 'Hide learning pathway' : 'Show learning pathway' }}
                </button>
              </div>
              @if (pathwayOpen().has(r.matching_result_id)) {
                <app-learning-pathway [matchingResultId]="r.matching_result_id" [refresh]="r.learning_recommendations" />
              }
              @if (canGenerate() && uncovered(r) > 0) {
                <div class="state empty">
                  <span>{{ r.learning_recommendations.length ? uncovered(r) + ' gap(s) have no learning plan yet.' : 'No learning plan yet.' }}</span>
                  <button type="button" class="btn btn-primary btn-sm" [disabled]="generating() === r.matching_result_id" (click)="generate(r.matching_result_id)">
                    @if (generating() === r.matching_result_id) { <span class="spinner"></span> } @else { <app-icon name="sparkle" [size]="16" /> }
                    Generate learning plan
                  </button>
                </div>
              }
            </article>
          } @empty {
            <div class="card state">No people match the filters.</div>
          }
        </div>
        }
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
    .table-wrap { overflow-x: auto; }
    .gap-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .gap-table td { padding: 10px; border-top: 1px solid var(--border); vertical-align: top; }
    .gap-table th { text-align: left; padding: 4px 6px; }
    .th-btn { background: none; border: 0; cursor: pointer; font-size: 12px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
    .gap-res { font-size: 13px; }
    .gap-res summary { cursor: pointer; font-weight: 700; color: var(--primary-dark); }
    .filters { align-items: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
    .check { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 14px; padding-bottom: 8px; }
  `
})
export class SkillGrowthComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private requirementsApi = inject(RequirementService);
  private learning = inject(LearningService);
  private toast = inject(ToastService);
  private lookups = inject(LookupService);
  private auth = inject(AuthService);
  private catalog = inject(LearningCatalogService);

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
  // Optional ?runId= shows an older run (for example the one before a rematch).
  readonly runId = signal<number | null>(null);
  readonly run = signal<MatchingRun | null>(null);
  readonly priorityFilter = signal('');
  readonly mandatoryOnly = signal(false);

  readonly canGenerate = computed(() => this.auth.hasAnyRole(...GENERATE_ROLES));
  readonly visibleReports = computed(() => {
    const filtering = !!this.priorityFilter() || this.mandatoryOnly();
    return this.reports().filter(r => !filtering || this.filteredGaps(r).length > 0);
  });

  // Approved catalog resources per gap, loaded the first time its expander is opened.
  readonly gapResources = signal<Record<number, GapResources | 'loading' | 'error'>>({});
  readonly humanise = humanise;

  onToggle(skillGapId: number, event: Event): void {
    if (!(event.target as HTMLDetailsElement).open || this.gapResources()[skillGapId]) return;
    this.gapResources.update(m => ({ ...m, [skillGapId]: 'loading' }));
    this.catalog.resourcesForGap(skillGapId).subscribe({
      next: res => this.gapResources.update(m => ({ ...m, [skillGapId]: res })),
      error: () => this.gapResources.update(m => ({ ...m, [skillGapId]: 'error' }))
    });
  }

  // Learning pathway per person (opened on demand).
  readonly pathwayOpen = signal<ReadonlySet<number>>(new Set());

  togglePathway(matchingResultId: number): void {
    this.pathwayOpen.update(s => {
      const next = new Set(s);
      if (!next.delete(matchingResultId)) next.add(matchingResultId);
      return next;
    });
  }

  // List view: one row per gap, filtered by the server.
  readonly listView = signal(false);
  readonly gapTypeFilter = signal('');
  readonly recFilter = signal('');
  readonly listItems = signal<GapListItem[]>([]);
  readonly listTotal = signal(0);
  readonly listLoading = signal(false);
  readonly listError = signal<ApiError | null>(null);
  readonly sortKey = signal<'priority' | 'resource_name' | 'skill_name' | 'gap_type' | 'gap_size'>('priority');
  readonly sortDesc = signal(false);
  readonly listColumns = [
    { key: 'priority' as const, label: 'Priority' },
    { key: 'resource_name' as const, label: 'Person' },
    { key: 'skill_name' as const, label: 'Skill' },
    { key: 'gap_type' as const, label: 'Type' },
    { key: 'gap_size' as const, label: 'Levels' }
  ];
  readonly sortedList = computed(() => {
    const key = this.sortKey();
    const dir = this.sortDesc() ? -1 : 1;
    return [...this.listItems()].sort((a, b) => {
      const c = key === 'priority' ? priorityRank(a.priority) - priorityRank(b.priority)
        : key === 'gap_size' ? a.gap_size - b.gap_size
        : String(a[key]).localeCompare(String(b[key]));
      return c * dir;
    });
  });
  readonly sourceInfo = sourceInfo;

  toggleListView(): void {
    this.listView.update(v => !v);
    this.loadList();
  }

  sortBy(key: 'priority' | 'resource_name' | 'skill_name' | 'gap_type' | 'gap_size'): void {
    if (this.sortKey() === key) this.sortDesc.update(d => !d);
    else { this.sortKey.set(key); this.sortDesc.set(false); }
  }

  loadList(): void {
    const requirementId = this.requirementId();
    if (!this.listView() || !requirementId) return;
    this.listLoading.set(true);
    this.listError.set(null);
    this.learning.listGaps({
      requirementId,
      runId: this.runId(),
      priority: this.priorityFilter() as GapPriority | '',
      gapType: this.gapTypeFilter() as GapType | '',
      mandatory: this.mandatoryOnly() ? true : null,
      hasRecommendation: this.recFilter() === '' ? null : this.recFilter() === 'true',
      limit: 500
    }).subscribe({
      next: res => {
        this.listItems.set(res?.gaps ?? []);
        this.listTotal.set(res?.total ?? 0);
        this.listLoading.set(false);
      },
      error: err => {
        this.listError.set(toApiError(err));
        this.listLoading.set(false);
      }
    });
  }

  readonly priorities = PRIORITY_ORDER;
  readonly priorityInfo = priorityInfo;
  readonly isRematch = isRematch;
  readonly initials = initials;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.projectId.set(Number(params.get('projectId')) || null);
      this.runId.set(Number(params.get('runId')) || null);
    });
    effect(() => {
      const id = this.requirementId();
      this.runId();
      untracked(() => {
        this.reports.set([]);
        this.run.set(null);
        this.listItems.set([]);
        if (id) {
          this.load(id);
          this.loadList();
        }
      });
    });
  }

  filteredGaps(r: SkillGapReport): SkillGap[] {
    const prio = this.priorityFilter();
    return r.gaps.filter(g => (!prio || g.priority === prio) && (!this.mandatoryOnly() || g.mandatory));
  }

  // A gap is uncovered when no recommendation points at it (by gap id, or by skill name for old data).
  uncovered(r: SkillGapReport): number {
    return r.gaps.filter(g => !r.learning_recommendations.some(l =>
      g.skill_gap_id != null && l.skill_gap_id != null
        ? l.skill_gap_id === g.skill_gap_id
        : l.skill_name.toLowerCase() === g.skill_name.toLowerCase())).length;
  }

  gapChipClass(g: SkillGap): string {
    switch (g.priority) {
      case 'CRITICAL': return 'chip-prio-critical';
      case 'HIGH': return 'chip-prio-high';
      case 'LOW': return 'chip-prio-low';
      default: return 'chip-needs';
    }
  }

  select(value: string): void {
    this.router.navigate([], { queryParams: { projectId: value || null } });
  }

  load(id: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.requirementsApi.getSkillGaps(id, this.runId()).subscribe({
      next: list => {
        this.reports.set((list ?? []).map(r => ({ ...r, gaps: r.gaps ?? [], learning_recommendations: r.learning_recommendations ?? [] })));
        this.loading.set(false);
        const runId = list?.[0]?.matching_run_id;
        if (runId) {
          this.requirementsApi.getRun(runId).subscribe({ next: run => this.run.set(run), error: () => this.run.set(null) });
        }
      },
      error: err => {
        this.error.set(toApiError(err));
        this.loading.set(false);
      }
    });
  }

  gapLabel(g: SkillGap): string {
    if (g.gap_type === 'MISSING' || !g.current_level) return `${g.skill_name} · missing, needs ${g.required_level ?? '?'}`;
    return `${g.skill_name} · have ${g.current_level} of ${g.required_level ?? '?'}`;
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
