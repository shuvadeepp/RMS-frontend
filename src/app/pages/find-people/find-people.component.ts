import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, isDevMode, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, catchError, of, switchMap, takeWhile, timer } from 'rxjs';
import { ApiError, toApiError } from '../../core/error-message';
import { Project } from '../../models/employee.model';
import {
  LlmMatch,
  MatchResult,
  MatchingRun,
  RequirementCreateResponse,
  RequirementRequest,
  RunStatus
} from '../../models/requirement.model';
import { PersonTag } from '../../models/tagged-people.model';
import { LookupService } from '../../services/lookup.service';
import { FindPeopleDraft, MatchStateService, emptyDraft } from '../../services/match-state.service';
import { RequirementService } from '../../services/requirement.service';
import { ScanConsoleComponent, ScanPhase } from '../../shared/scan-console.component';
import { DatePickerComponent } from '../../shared/date-picker.component';
import { DecisionControlsComponent } from '../../shared/decision-controls.component';
import { EmployeeCardComponent } from '../../shared/employee-card.component';
import { fromRawEmployee } from '../../shared/employee-view';
import { ErrorBoxComponent } from '../../shared/error-box.component';
import { IconComponent } from '../../shared/icon.component';
import {
  CATEGORIES,
  CATEGORY_ORDER,
  MATCH_STATUS,
  MatchStatusKey,
  availabilityOf,
  categoryOf,
  formatDayMonYear,
  isRematch,
  matchStatus,
  skillNames
} from '../../shared/labels';
import { ScoreRingComponent } from '../../shared/score-ring.component';
import { TagBadgeComponent } from '../../shared/tag-badge.component';

type Phase = 'idle' | 'submitting' | 'running' | 'loading-results' | 'loading-employees';
// The four mandatory fields, plus the optional filters that can carry a backend field error.
type FieldKey = 'project' | 'date' | 'experience' | 'skills' | 'designation' | 'department';

const MISSING_LABELS: Array<[FieldKey, string]> = [
  ['project', 'Project'], ['date', 'Date'], ['experience', 'Experience'], ['skills', 'Skill']
];

// Maps a backend field name from a 400 "fields" body to the input it belongs to.
function fieldKeyOf(name: string): FieldKey | null {
  if (name.startsWith('project_')) return 'project';
  if (name === 'joining_date') return 'date';
  if (name === 'minimum_experience_years') return 'experience';
  if (name.startsWith('required_skills')) return 'skills';
  if (name === 'designation' || name === 'department') return name;
  return null;
}

// Reads 400 "fields" errors, sent as a map ({"joining_date": "..."}) or a list ([{field, message}]).
function fieldErrorsOf(err: unknown): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  if (!(err instanceof HttpErrorResponse) || err.status !== 400) return out;
  const fields: unknown = (err.error as { fields?: unknown } | null)?.fields;
  const entries: Array<[string, unknown]> = Array.isArray(fields)
    ? fields.map((f: unknown): [string, unknown] => {
        const item = (f ?? {}) as { field?: unknown; message?: unknown };
        return [String(item.field ?? ''), item.message];
      })
    : fields && typeof fields === 'object' ? Object.entries(fields) : [];
  for (const [name, message] of entries) {
    const key = fieldKeyOf(name);
    if (key && !out[key]) out[key] = typeof message === 'string' && message ? message : 'Invalid value';
  }
  return out;
}
type Tab = 'ALL' | 'WAITING' | 'SHORTLISTED' | 'ON_HOLD' | 'REJECTED' | 'APPROVED';

const POLL_MS = 2000;
const TERMINAL: RunStatus[] = ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'];

@Component({
  selector: 'app-find-people',
  imports: [
    FormsModule, RouterLink, IconComponent, ScoreRingComponent, ErrorBoxComponent,
    ScanConsoleComponent, DecisionControlsComponent, EmployeeCardComponent, TagBadgeComponent, DatePickerComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './find-people.component.html',
  styleUrl: './find-people.component.scss'
})
export class FindPeopleComponent implements OnInit {
  private lookups = inject(LookupService);
  private requirements = inject(RequirementService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  readonly state = inject(MatchStateService);

  readonly skillOptions = toSignal(this.lookups.getSkills().pipe(catchError(() => of([]))), { initialValue: [] });
  readonly designations = toSignal(this.lookups.getDesignations().pipe(catchError(() => of([]))), { initialValue: [] });
  readonly departments = toSignal(this.lookups.getDepartments().pipe(catchError(() => of([]))), { initialValue: [] });
  readonly projects = toSignal(this.lookups.getProjects().pipe(catchError(() => of<Project[]>([]))), { initialValue: [] });

  readonly experienceOptions = [0, 1, 2, 3, 5];
  readonly levels = [1, 2, 3, 4, 5];

  readonly draft = this.state.draft;
  readonly addOpen = signal(false);
  readonly newSkill = signal('');
  readonly newLevel = signal(3);
  readonly moreFilters = signal(false);

  readonly phase = signal<Phase>('idle');
  readonly error = signal<ApiError | null>(null);
  private retryAction: (() => void) | null = null;
  readonly prefillLoading = signal(false);

  // Polling state.
  private pollSub: Subscription | null = null;
  private runStartedAt = 0;
  readonly elapsed = signal(0);
  readonly busy = computed(() => this.phase() !== 'idle');
  // The live scan console replaces the page while a search is starting, running or opening results.
  readonly showConsole = computed(
    () => this.phase() === 'submitting' || this.phase() === 'running' || this.phase() === 'loading-results'
  );
  readonly consolePhase = computed<ScanPhase>(() => {
    const p = this.phase();
    return p === 'running' || p === 'loading-results' ? p : 'submitting';
  });
  readonly consoleSkills = computed(() =>
    (this.state.requirement()?.required_skills ?? this.draft().skills).map(s => s.skill_name)
  );

  // Form hints.
  // The selected project, by id (or by name for a prefilled requirement without project_id).
  readonly selectedProject = computed<Project | null>(() => {
    const d = this.draft();
    const list = this.projects();
    if (d.projectId !== null) return list.find(p => p.projectId === d.projectId) ?? null;
    return d.projectName ? list.find(p => p.projectName === d.projectName) ?? null : null;
  });
  // Mandatory-field checks; "Required" shows once a field was touched or a search was tried.
  readonly touched = signal<ReadonlySet<FieldKey>>(new Set());
  readonly fieldErrors = signal<Partial<Record<FieldKey, string>>>({});
  readonly missing = computed(() => {
    const d = this.draft();
    const valid: Record<FieldKey, boolean> = {
      project: !!this.selectedProject(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(d.joiningDate),
      experience: d.minExperience !== null,
      skills: d.skills.length > 0,
      designation: true,
      department: true
    };
    return MISSING_LABELS.filter(([key]) => !valid[key]);
  });
  readonly missingText = computed(() => this.missing().map(([, label]) => label).join(', '));
  readonly formValid = computed(() => this.missing().length === 0);
  readonly availableSkills = computed(() => {
    const chosen = new Set(this.draft().skills.map(s => s.skill_name.toLowerCase()));
    return this.skillOptions().filter(s => !chosen.has(s.skillName.toLowerCase()));
  });

  // Results.
  readonly matches = this.state.sortedMatches;
  readonly tab = signal<Tab>('ALL');
  readonly tabs = computed(() => {
    const list = this.matches().map(matchStatus);
    const count = (keys: MatchStatusKey[]) => list.filter(s => keys.includes(s)).length;
    return [
      { key: 'ALL' as Tab, label: 'All', count: list.length },
      { key: 'WAITING' as Tab, label: 'Waiting', count: count(['WAITING']) },
      { key: 'SHORTLISTED' as Tab, label: 'Shortlisted', count: count(['SHORTLISTED']) },
      { key: 'ON_HOLD' as Tab, label: 'On hold', count: count(['ON_HOLD']) },
      { key: 'REJECTED' as Tab, label: 'Rejected', count: count(['REJECTED']) },
      { key: 'APPROVED' as Tab, label: 'Approved', count: count(['APPROVED', 'ALLOCATED']) }
    ];
  });
  readonly visibleMatches = computed(() => {
    const tab = this.tab();
    if (tab === 'ALL') return this.matches();
    return this.matches().filter(m => {
      const s = matchStatus(m);
      return tab === 'APPROVED' ? s === 'APPROVED' || s === 'ALLOCATED' : s === tab;
    });
  });
  readonly categoryCounts = computed(() =>
    CATEGORY_ORDER.map(key => ({
      info: CATEGORIES[key],
      count: this.matches().filter(m => categoryOf(m.overall_score, m.match_category).key === key).length
    })).filter(c => c.count > 0)
  );
  readonly poolSize = computed(() => this.state.employeesSent() ?? this.state.run()?.candidate_pool_size ?? null);
  readonly step = computed(() => {
    if (this.state.mode() !== 'matches') return this.state.runInProgress() ? 2 : 1;
    return this.matches().some(m => matchStatus(m) !== 'WAITING') ? 3 : 2;
  });

  // Tagged people: who the search left out, and who was kept but tagged.
  readonly tagged = this.state.taggedPeople;
  readonly excludedCount = computed(() => this.tagged()?.excluded_count ?? this.tagged()?.excluded?.length ?? 0);
  private readonly taggedIncluded = computed(
    () => new Map((this.tagged()?.included ?? []).filter(p => p.employee_code).map(p => [p.employee_code!, p]))
  );

  readonly isRematch = isRematch;
  readonly categoryOf = categoryOf;
  readonly availabilityOf = availabilityOf;
  readonly formatDayMonYear = formatDayMonYear;
  readonly statusInfo = (m: MatchResult) => MATCH_STATUS[matchStatus(m)];

  ngOnInit(): void {
    const id = Number(this.route.snapshot.queryParamMap.get('requirementId'));
    if (id) {
      this.prefillFrom(id);
    } else if (this.state.runInProgress() && this.state.runId()) {
      // Came back while a run was still going: keep polling it.
      if (this.state.runStartedAt() === null) this.state.runStartedAt.set(Date.now());
      this.poll(this.state.runId()!);
    }
  }

  // ---------- Form ----------
  patch(change: Partial<FindPeopleDraft>, field?: FieldKey): void {
    this.draft.update(d => ({ ...d, ...change }));
    if (field) {
      this.touch(field);
      this.clearFieldError(field);
    }
  }

  touch(field: FieldKey): void {
    if (!this.touched().has(field)) this.touched.update(set => new Set(set).add(field));
  }

  // The message under a field: a backend error, or "Required" once touched and still missing.
  fieldMessage(field: FieldKey): string {
    const backend = this.fieldErrors()[field];
    if (backend) return backend;
    return this.touched().has(field) && this.missing().some(([key]) => key === field) ? 'Required' : '';
  }

  private clearFieldError(field: FieldKey): void {
    if (this.fieldErrors()[field]) this.fieldErrors.update(e => ({ ...e, [field]: undefined }));
  }

  selectProject(projectId: number | null): void {
    const project = this.projects().find(p => p.projectId === projectId) ?? null;
    this.patch({ projectId: project?.projectId ?? null, projectName: project?.projectName ?? '' }, 'project');
  }

  toggleMandatory(index: number): void {
    this.draft.update(d => ({ ...d, skills: d.skills.map((s, i) => (i === index ? { ...s, mandatory: !s.mandatory } : s)) }));
  }

  removeSkill(index: number): void {
    this.draft.update(d => ({ ...d, skills: d.skills.filter((_, i) => i !== index) }));
    this.touch('skills');
  }

  cancelAdd(): void {
    this.addOpen.set(false);
    this.touch('skills');
  }

  addSkill(): void {
    const name = this.newSkill();
    if (!name) return;
    this.draft.update(d => ({ ...d, skills: [...d.skills, { skill_name: name, minimum_proficiency: this.newLevel(), mandatory: true }] }));
    this.newSkill.set('');
    this.newLevel.set(3);
    this.addOpen.set(false);
    this.touch('skills');
    this.clearFieldError('skills');
  }

  // Resets every field and its messages; a linked ?requirementId= is dropped so it does not prefill again.
  clearFilters(): void {
    this.draft.set(emptyDraft());
    this.touched.set(new Set());
    this.fieldErrors.set({});
    this.addOpen.set(false);
    this.newSkill.set('');
    this.newLevel.set(3);
    this.moreFilters.set(false);
    if (this.route.snapshot.queryParamMap.has('requirementId')) {
      this.router.navigate([], { queryParams: { requirementId: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  // ---------- Run ----------
  submit(): void {
    if (this.busy()) return;
    this.touched.set(new Set(MISSING_LABELS.map(([key]) => key)));
    const d = this.draft();
    const project = this.selectedProject();
    if (!this.formValid() || !project || d.minExperience === null) return;

    // Every search is saved: all mandatory fields are sent; optional filters only when chosen.
    const request: RequirementRequest = {
      project_id: project.projectId,
      project_name: project.projectName,
      joining_date: d.joiningDate,
      minimum_experience_years: d.minExperience,
      required_skills: d.skills.map(s => ({ skill_name: s.skill_name, mandatory: s.mandatory, minimum_proficiency: s.minimum_proficiency })),
      ...(d.designation ? { designation: d.designation } : {}),
      ...(d.department ? { department: d.department } : {})
    };

    this.stopPolling();
    this.error.set(null);
    this.fieldErrors.set({});
    this.state.clearResults();
    this.tab.set('ALL');
    this.state.runStartedAt.set(Date.now());

    if (isDevMode()) console.debug('[find-people] POST /api/requirements?async=true body', request);
    this.phase.set('submitting');
    this.requirements.createRequirement(request).subscribe({
      next: res => {
        if (isDevMode()) console.debug('[find-people] POST /api/requirements response', res);
        this.handleResponse(res, request);
      },
      error: err => {
        if (isDevMode()) console.debug('[find-people] POST /api/requirements error', err instanceof HttpErrorResponse ? err.error : err);
        const fields = fieldErrorsOf(err);
        if (Object.keys(fields).length) {
          this.fieldErrors.set(fields);
          this.fail({ status: 400, title: 'Please fix the highlighted fields.', detail: null, rootCause: null, retryable: false }, () => this.submit());
          return;
        }
        this.fail(toApiError(err), () => this.submit());
      }
    });
  }

  private handleResponse(res: RequirementCreateResponse, request: RequirementRequest): void {
    this.state.employeesSent.set(res.employees_sent ?? null);
    this.state.taggedPeople.set(res.tagged_people ?? null);

    if (res.matching_run_id && res.requirement_id) {
      this.state.requirementId.set(res.requirement_id);
      this.state.requirement.set({ requirement_id: res.requirement_id, ...request });
      this.state.runId.set(res.matching_run_id);
      this.poll(res.matching_run_id);
      return;
    }
    if (res.llm_result) {
      this.state.preview.set(res.llm_result.matches ?? []);
      this.state.mode.set('preview');
      this.phase.set('idle');
      return;
    }
    if (res.employees) {
      this.state.employees.set(res.employees.map(fromRawEmployee));
      this.state.mode.set('employees');
      this.phase.set('idle');
      return;
    }
    this.fail({ status: 200, title: 'Unexpected answer from the server.', detail: res.message ?? null, rootCause: null, retryable: true }, () => this.submit());
  }

  // Poll the run every 2 s until it finishes; stops automatically when the page is left.
  private poll(runId: number): void {
    this.stopPolling();
    this.phase.set('running');
    this.runStartedAt = Date.now();
    this.elapsed.set(0);

    this.pollSub = timer(0, POLL_MS)
      .pipe(
        switchMap(() => this.requirements.getRun(runId)),
        takeWhile(run => !TERMINAL.includes(run.run_status), true),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: run => {
          this.state.run.set(run);
          this.elapsed.set(Math.round((Date.now() - this.runStartedAt) / 1000));
          this.onRunUpdate(run);
        },
        error: err => this.fail(toApiError(err), () => this.poll(runId))
      });
  }

  private onRunUpdate(run: MatchingRun): void {
    if (run.run_status === 'COMPLETED' || run.run_status === 'COMPLETED_WITH_ERRORS') {
      this.loadMatches(run.requirement_id ?? this.state.requirementId()!, run.matching_run_id);
    } else if (run.run_status === 'FAILED') {
      this.fail(
        { status: 0, title: 'The matching run failed.', detail: run.error_message ?? null, rootCause: null, retryable: true },
        () => this.submit()
      );
    }
  }

  private loadMatches(requirementId: number, runId: number): void {
    this.phase.set('loading-results');
    this.requirements.getMatches(requirementId, runId).subscribe({
      next: matches => {
        if (isDevMode()) console.debug('[find-people] GET matches response', matches);
        this.state.requirementId.set(requirementId);
        this.state.matches.set(matches);
        this.state.mode.set('matches');
        this.phase.set('idle');
      },
      error: err => this.fail(toApiError(err), () => this.loadMatches(requirementId, runId))
    });
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
  }

  private fail(error: ApiError, retry: () => void): void {
    this.stopPolling();
    this.error.set(error);
    this.retryAction = retry;
    this.phase.set('idle');
  }

  retry(): void {
    this.error.set(null);
    this.retryAction?.();
  }

  // ---------- Results ----------
  onChanged(match: MatchResult): void {
    this.state.updateMatch(match);
  }

  sendForReview(): void {
    this.router.navigate(['/decisions'], { queryParams: { requirementId: this.state.requirementId() } });
  }

  // A match's own tags, else its entry in tagged_people.included (saved matches are reloaded without tags).
  tagsOf(m: MatchResult | LlmMatch): { tags: PersonTag[]; free: number | null } {
    const kept = this.taggedIncluded().get(m.employee_code);
    return {
      tags: m.tags ?? kept?.tags ?? [],
      free: m.window_free_percentage ?? kept?.window_free_percentage ?? null
    };
  }

  hasSkills(m: MatchResult | LlmMatch): string[] {
    return 'matching_result_id' in m ? skillNames(m.strengths?.matching_skills) : skillNames((m as LlmMatch).matching_skills);
  }

  needsSkills(m: MatchResult | LlmMatch): string[] {
    if ('matching_result_id' in m) {
      return [
        ...skillNames(m.skill_gaps?.missing_skills),
        ...skillNames(m.skill_gaps?.below_required_proficiency).map(s => `${s} (level up)`)
      ];
    }
    return skillNames((m as LlmMatch).missing_skills);
  }

  private prefillFrom(id: number): void {
    if (this.state.requirementId() !== id) {
      this.stopPolling();
      this.state.clearResults();
    }
    this.prefillLoading.set(true);
    this.requirements.getRequirement(id).subscribe({
      next: r => {
        this.draft.set({
          projectId: r.project_id ?? null,
          projectName: r.project_name ?? '',
          joiningDate: (r.joining_date ?? '').slice(0, 10),
          minExperience: r.minimum_experience_years ?? null,
          designation: r.designation ?? '',
          department: r.department ?? '',
          skills: r.required_skills ?? []
        });
        this.moreFilters.set(Boolean(r.designation || r.department));
        this.prefillLoading.set(false);
      },
      error: () => this.prefillLoading.set(false)
    });
  }
}
