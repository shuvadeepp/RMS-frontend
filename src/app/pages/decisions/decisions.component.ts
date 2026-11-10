import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiError, toApiError } from '../../core/error-message';
import { ToastService } from '../../core/toast.service';
import { DecisionRecord } from '../../models/decision.model';
import { Project } from '../../models/employee.model';
import { MatchResult, Requirement } from '../../models/requirement.model';
import { DecisionService } from '../../services/decision.service';
import { LookupService } from '../../services/lookup.service';
import { MatchStateService } from '../../services/match-state.service';
import { RequirementService } from '../../services/requirement.service';
import { DatePickerComponent } from '../../shared/date-picker.component';
import { DecisionControlsComponent } from '../../shared/decision-controls.component';
import { ErrorBoxComponent } from '../../shared/error-box.component';
import { IconComponent } from '../../shared/icon.component';
import { MATCH_STATUS, availabilityOf, decisionLabel, formatDate, formatDateTime, initials, matchStatus } from '../../shared/labels';

@Component({
  selector: 'app-decisions',
  imports: [FormsModule, RouterLink, IconComponent, ErrorBoxComponent, DecisionControlsComponent, DatePickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './decisions.component.html',
  styleUrl: './decisions.component.scss'
})
export class DecisionsComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private requirementsApi = inject(RequirementService);
  private decisionsApi = inject(DecisionService);
  private state = inject(MatchStateService);
  private toast = inject(ToastService);
  private lookups = inject(LookupService);

  readonly requirementList = toSignal(
    this.requirementsApi.getRequirements().pipe(catchError(() => of<Requirement[]>([]))),
    { initialValue: null }
  );

  readonly projects = toSignal(
    this.lookups.getProjects().pipe(catchError(() => of<Project[]>([]))),
    { initialValue: null }
  );
  // From the URL: ?projectId= (the dropdown) or ?requirementId= (links from Find People and other pages).
  private readonly queryProjectId = signal<number | null>(null);
  private readonly queryRequirementId = signal<number | null>(null);

  // Decisions belong to a requirement: a linked one, else the selected project's latest one.
  readonly requirementId = computed(() => {
    const linked = this.queryRequirementId();
    if (linked) return linked;
    const project = this.selectedProject();
    if (!project) return null;
    const ids = (this.requirementList() ?? [])
      .filter(r => r.project_id === project.projectId || (!r.project_id && r.project_name === project.projectName))
      .map(r => r.requirement_id);
    return ids.length ? Math.max(...ids) : null;
  });
  // The project shown in the dropdown: the chosen one, or the linked requirement's project.
  readonly selectedProject = computed<Project | null>(() => {
    const list = this.projects() ?? [];
    const projectId = this.queryProjectId();
    if (projectId) return list.find(p => p.projectId === projectId) ?? null;
    const linked = this.queryRequirementId();
    if (!linked) return null;
    const r = this.requirement()?.requirement_id === linked
      ? this.requirement()
      : (this.requirementList() ?? []).find(x => x.requirement_id === linked);
    if (!r) return null;
    return list.find(p => p.projectId === r.project_id) ?? list.find(p => p.projectName === r.project_name) ?? null;
  });
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly requirement = signal<Requirement | null>(null);
  readonly matches = signal<MatchResult[]>([]);
  readonly history = signal<DecisionRecord[]>([]);
  readonly historyError = signal<string | null>(null);

  readonly allocFor = signal<number | null>(null);
  readonly allocPercentOptions = [100, 75, 50, 35, 25];
  readonly allocPercent = signal(100);
  readonly allocStart = signal('');
  readonly allocEnd = signal('');
  readonly allocating = signal(false);

  // Shortlisted or already decided people.
  readonly people = computed(() =>
    this.matches()
      .filter(m => m.recommendation_status === 'RECOMMENDED' || m.current_decision)
      .sort((a, b) => b.overall_score - a.overall_score)
  );

  readonly pipeline = computed(() => {
    const statuses = this.people().map(matchStatus);
    const count = (...keys: string[]) => statuses.filter(s => keys.includes(s)).length;
    return [
      { label: 'Matched', count: this.matches().length },
      { label: 'Shortlisted', count: statuses.length },
      { label: 'Under review', count: count('SHORTLISTED', 'ON_HOLD') },
      { label: 'Approved', count: count('APPROVED') },
      { label: 'Confirmed', count: count('ALLOCATED') }
    ];
  });

  readonly activity = computed(() => {
    const names = new Map(this.matches().map(m => [m.matching_result_id, m.resource_name]));
    return [...this.history()]
      .sort((a, b) => b.id - a.id)
      .map(d => ({ ...d, name: d.resourceName ?? names.get(d.matchingResultId) ?? 'a candidate', label: decisionLabel(d.decision).label }));
  });

  readonly projectName = computed(() =>
    this.selectedProject()?.projectName ?? this.requirement()?.project_name ?? `Requirement #${this.requirementId()}`
  );

  readonly initials = initials;
  readonly availabilityOf = availabilityOf;
  readonly formatDate = formatDate;
  readonly formatDateTime = formatDateTime;
  readonly statusInfo = (m: MatchResult) => MATCH_STATUS[matchStatus(m)];
  readonly matchStatus = matchStatus;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.queryProjectId.set(Number(params.get('projectId')) || null);
      this.queryRequirementId.set(Number(params.get('requirementId')) || null);
    });
    effect(() => {
      const id = this.requirementId();
      untracked(() => {
        if (id) {
          this.load(id);
        } else {
          this.requirement.set(null);
          this.matches.set([]);
          this.history.set([]);
        }
      });
    });
  }

  selectProject(value: string): void {
    this.router.navigate([], { queryParams: { projectId: value || null } });
  }

  load(id: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.historyError.set(null);
    this.allocFor.set(null);
    forkJoin({
      requirement: this.requirementsApi.getRequirement(id),
      matches: this.requirementsApi.getMatches(id),
      history: this.decisionsApi.getDecisions(id).pipe(
        catchError(err => {
          this.historyError.set(toApiError(err).title);
          return of<DecisionRecord[]>([]);
        })
      )
    }).subscribe({
      next: r => {
        this.requirement.set(r.requirement);
        this.matches.set(r.matches);
        this.history.set(r.history);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(toApiError(err));
        this.loading.set(false);
      }
    });
  }

  onChanged(match: MatchResult): void {
    this.matches.update(list => list.map(m => (m.matching_result_id === match.matching_result_id ? match : m)));
    if (this.state.requirementId() === this.requirementId()) {
      this.state.updateMatch(match);
    }
    this.refreshHistory();
  }

  private refreshHistory(): void {
    const id = this.requirementId();
    if (!id) return;
    this.decisionsApi.getDecisions(id).pipe(catchError(() => of(null))).subscribe(list => {
      if (list) this.history.set(list);
    });
  }

  // Allocation changes availability: refetch this page's matches and the ones Find People holds.
  private refreshMatches(id: number): void {
    if (this.state.requirementId() !== id) this.state.refreshMatches();
    this.requirementsApi.getMatches(id).pipe(catchError(() => of(null))).subscribe(list => {
      if (!list || this.requirementId() !== id) return;
      this.matches.set(list);
      if (this.state.requirementId() === id) this.state.matches.set(list);
    });
  }

  openAllocation(match: MatchResult): void {
    this.allocFor.set(match.matching_result_id);
    this.allocPercent.set(100);
    this.allocStart.set((this.requirement()?.joining_date ?? '').slice(0, 10));
    this.allocEnd.set('');
  }

  confirmAllocation(match: MatchResult): void {
    const requirementId = this.requirementId();
    const decisionId = match.current_decision?.allocation_decision_id;
    if (!requirementId || !decisionId || !this.allocStart() || (this.allocEnd() && this.allocEnd() < this.allocStart())) return;

    this.allocating.set(true);
    this.decisionsApi.createAllocation({
      requirement_id: requirementId,
      employee_id: match.employee_id,
      allocation_percentage: this.allocPercent(),
      start_date: this.allocStart(),
      end_date: this.allocEnd() || null,
      decision_id: decisionId
    }).subscribe({
      next: res => {
        this.allocating.set(false);
        this.allocFor.set(null);
        this.onChanged({ ...match, current_decision: { ...match.current_decision!, allocation_id: res.allocationId } });
        this.refreshMatches(requirementId);
        this.toast.success(`Allocation proposed for ${match.resource_name} from ${formatDate(res.startDate)}.`);
      },
      error: err => {
        this.allocating.set(false);
        const e = toApiError(err);
        this.toast.error(e.status === 409 ? 'Only an approved person who is not yet allocated can be allocated.' : `Allocation failed: ${e.detail ?? e.title}`);
      }
    });
  }
}
