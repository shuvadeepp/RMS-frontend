import { HttpResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, catchError, of } from 'rxjs';
import { saveBlob } from '../../core/download';
import { ApiError, toApiError } from '../../core/error-message';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../core/toast.service';
import { Project } from '../../models/employee.model';
import { AuditLog, DashboardSummary, GapPriority, MatchCategory, Requirement } from '../../models/requirement.model';
import { GapSummary } from '../../models/learning-pathway.model';
import { DecisionService } from '../../services/decision.service';
import { LearningService } from '../../services/learning.service';
import { LookupService } from '../../services/lookup.service';
import { RequirementService } from '../../services/requirement.service';
import { BarChartComponent, BarRow } from '../../shared/bar-chart.component';
import { DatePickerComponent } from '../../shared/date-picker.component';
import { ErrorBoxComponent } from '../../shared/error-box.component';
import { IconComponent } from '../../shared/icon.component';
import { CATEGORIES, PRIORITY_ORDER, formatDateTime, humanise, parseTimestamp, priorityInfo, toCounts, toIsoDate } from '../../shared/labels';

// Bar colours for gap priority (label text is always shown too).
const PRIORITY_BAR: Record<GapPriority, string> = {
  CRITICAL: '#C0392B',
  HIGH: '#D9661F',
  MEDIUM: '#C98400',
  LOW: '#5E6CB0'
};

// Bar colours for match categories; "Low match" uses a deeper slate than its pill so it passes the chart checks.
const CATEGORY_BAR: Record<MatchCategory, string> = {
  EXCELLENT: '#11805F',
  GOOD: '#3B4EDB',
  PARTIAL: '#C98400',
  LOW: '#5E6CB0'
};

const LOG_PAGE_SIZE = 20;
const LOG_ROLES = ['USER', 'ADMIN', 'PROJECT_MANAGER', 'RESOURCE_MANAGER', 'LK_ADMIN'];

const DECISION_TEXT: Record<string, string> = {
  SELECTED: 'Approved',
  ON_HOLD: 'On hold',
  DEFERRED: 'On hold',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn'
};

@Component({
  selector: 'app-reports',
  imports: [FormsModule, IconComponent, ErrorBoxComponent, BarChartComponent, DatePickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header>
        <p class="eyebrow">Reports</p>
        <h1 class="page-title">How matching is going</h1>
      </header>

      @if (summaryError()) {
        <app-error-box [error]="summaryError()!" (retry)="loadSummary()" />
      } @else if (!summary()) {
        <div class="card state" role="status"><span class="spinner"></span> Loading figures...</div>
      } @else {
        <div class="grid grid-4">
          @for (t of tiles(); track t.label) {
            <div class="card tile">
              <span class="tile-value">{{ t.value ?? 0 }}</span>
              <span class="tile-label">{{ t.label }}</span>
            </div>
          }
        </div>

        <div class="grid grid-3">
          <section class="card" aria-labelledby="c1"><h2 id="c1" class="section-title chart-title">Matches by category</h2>
            <app-bar-chart [rows]="byCategory()" label="Matches by category" /></section>
          <section class="card" aria-labelledby="c2"><h2 id="c2" class="section-title chart-title">Decisions by type</h2>
            <app-bar-chart [rows]="byDecision()" label="Decisions by type" /></section>
          <section class="card" aria-labelledby="c3"><h2 id="c3" class="section-title chart-title">Matching runs by status</h2>
            <app-bar-chart [rows]="byRunStatus()" label="Matching runs by status" /></section>
        </div>
      }

      <section aria-labelledby="gaps-title" class="gaps">
        <h2 id="gaps-title" class="section-title">Skill gaps across the workforce</h2>
        <p class="muted small">Latest finished run of every project.</p>
        @if (gapError()) {
          <app-error-box [error]="gapError()!" (retry)="loadGapSummary()" />
        } @else if (!gaps()) {
          <div class="card state" role="status"><span class="spinner"></span> Loading skill gaps...</div>
        } @else {
          <div class="grid grid-4">
            @for (t of gapTiles(); track t.label) {
              <div class="card tile">
                <span class="tile-value">{{ t.value }}</span>
                <span class="tile-label">{{ t.label }}</span>
              </div>
            }
          </div>
          <div class="grid grid-2">
            <section class="card" aria-labelledby="g1"><h2 id="g1" class="section-title chart-title">Gaps by priority</h2>
              <app-bar-chart [rows]="gapByPriority()" label="Gaps by priority" /></section>
            <section class="card" aria-labelledby="g2"><h2 id="g2" class="section-title chart-title">Most common gaps</h2>
              @if (gaps()!.most_common_gap_skills.length === 0) {
                <p class="state">No gaps found.</p>
              } @else {
                <ul class="list">
                  @for (s of gaps()!.most_common_gap_skills; track s.skill_id) {
                    <li class="common">
                      <span class="list-title">{{ s.skill_name }}</span>
                      <span class="muted small">{{ s.gap_count }} gap(s) · {{ s.employees_affected }} {{ s.employees_affected === 1 ? 'person' : 'people' }}</span>
                    </li>
                  }
                </ul>
              }
            </section>
          </div>
        }
      </section>

      <section class="card" aria-labelledby="dl-title">
        <h2 id="dl-title" class="section-title chart-title">Download Excel</h2>
        <div class="downloads">
          <div class="field selector">
            <label for="dl-req">Project</label>
            <select id="dl-req" class="select" #sel (change)="projectId.set(+sel.value || null)">
              <option value="">All projects (decisions only)</option>
              @for (p of projects() ?? []; track p.projectId) {
                <option [value]="p.projectId"><strong>{{ p.projectCode }}</strong> - {{ p.projectName }}</option>
              }
            </select>
          </div>
          <button type="button" class="btn btn-primary" [disabled]="!exportId() || downloading() !== null" (click)="downloadMatches()">
            @if (downloading() === 'matches') { <span class="spinner"></span> } @else { <app-icon name="arrow-right" [size]="16" /> }
            Download matches (Excel)
          </button>
          <button type="button" class="btn" [disabled]="downloading() !== null || (projectId() !== null && !exportId())" (click)="downloadDecisions()">
            @if (downloading() === 'decisions') { <span class="spinner"></span> } @else { <app-icon name="arrow-right" [size]="16" /> }
            Download decisions (Excel)
          </button>
        </div>
        @if (!projectId()) {
          <p class="hint">Choose a project to download its matches.</p>
        } @else if (requirements() !== null && !exportId()) {
          <p class="hint">No AI matching has been run for this project yet.</p>
        }
      </section>

      @if (canSeeLogs()) {
      <section class="card" aria-labelledby="log-title">
        <h2 id="log-title" class="section-title chart-title">Activity log</h2>
        <div class="log-filter">
          <div class="field dp"><label for="log-from">From</label>
            <app-date-picker inputId="log-from" placeholder="Start date" [max]="logTo() || null"
                             [ngModel]="logFrom()" (ngModelChange)="logFrom.set($event || ''); logPage.set(1)" /></div>
          <div class="field dp"><label for="log-to">To</label>
            <app-date-picker inputId="log-to" placeholder="End date" [min]="logFrom() || null"
                             [ngModel]="logTo()" (ngModelChange)="logTo.set($event || ''); logPage.set(1)" /></div>
          @if (logFrom() || logTo()) {
            <button type="button" class="btn" (click)="logFrom.set(''); logTo.set(''); logPage.set(1)">Clear dates</button>
          }
        </div>
        @if (logsError()) {
          <app-error-box [error]="logsError()!" (retry)="loadLogs()" />
        } @else if (logs() === null) {
          <div class="state" role="status"><span class="spinner"></span> Loading activity...</div>
        } @else if (filteredLogs().length === 0) {
          <p class="state">{{ logs()!.length === 0 ? 'No activity yet.' : 'No activity in this date range.' }}</p>
        } @else {
          <div class="table-wrap">
            <table>
              <caption class="sr-only">Latest actions, newest first</caption>
              <thead><tr><th scope="col">#</th><th scope="col">Time</th><th scope="col">User</th><th scope="col">Action</th><th scope="col">Record</th></tr></thead>
              <tbody>
                @for (l of pagedLogs(); track $index) {
                  <tr>
                    <td>{{ (logPage() - 1) * logPageSize + $index + 1 }}</td>
                    <td>{{ formatDateTime(l.action_timestamp) }}</td>
                    <td>{{ userOf(l) }}</td>
                    <td>{{ humanise(l.action || l.action_type) }}</td>
                    <td>{{ humanise(l.entity_name || l.entity) }}@if (l.record_id !== null && l.record_id !== undefined) { #{{ l.record_id }} }</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (logPages() > 1) {
            <nav class="pager" aria-label="Activity log pages">
              <button type="button" class="btn" [disabled]="logPage() <= 1" (click)="logPage.set(logPage() - 1)">Previous</button>
              <span class="muted small">Page {{ logPage() }} of {{ logPages() }} · {{ filteredLogs().length }} entries</span>
              <button type="button" class="btn" [disabled]="logPage() >= logPages()" (click)="logPage.set(logPage() + 1)">Next</button>
            </nav>
          }
        }
      </section>
      }
    </div>
  `,
  styles: `
    .chart-title { margin-bottom: 16px; }
    .gaps { display: flex; flex-direction: column; gap: 12px; }
    .common { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .downloads { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
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
    .hint { margin-top: 8px; }
    .log-filter { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 12px; }
    .dp { width: 220px; max-width: 100%; }
    .pager { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 12px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding: 8px 10px; border-bottom: 1px solid var(--border); }
    td { padding: 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    tbody tr:hover { background: var(--bg); }
  `
})
export class ReportsComponent implements OnInit {
  private requirementsApi = inject(RequirementService);
  private decisionsApi = inject(DecisionService);
  private toast = inject(ToastService);
  private lookups = inject(LookupService);
  private learning = inject(LearningService);

  readonly summary = signal<DashboardSummary | null>(null);
  readonly summaryError = signal<ApiError | null>(null);
  readonly logs = signal<AuditLog[] | null>(null);
  readonly logsError = signal<ApiError | null>(null);
  readonly requirements = toSignal(
    this.requirementsApi.getRequirements().pipe(catchError(() => of<Requirement[]>([]))),
    { initialValue: null }
  );
  readonly projects = toSignal(
    this.lookups.getProjects().pipe(catchError(() => of<Project[]>([]))),
    { initialValue: null }
  );
  readonly projectId = signal<number | null>(null);
  readonly selectedProject = computed(() => (this.projects() ?? []).find(p => p.projectId === this.projectId()) ?? null);
  // Exports work per requirement; use the selected project's latest one.
  readonly exportId = computed(() => {
    const project = this.selectedProject();
    if (!project) return null;
    const ids = (this.requirements() ?? [])
      .filter(r => r.project_id === project.projectId || (!r.project_id && r.project_name === project.projectName))
      .map(r => r.requirement_id);
    return ids.length ? Math.max(...ids) : null;
  });
  readonly downloading = signal<'matches' | 'decisions' | null>(null);

  readonly tiles = computed(() => {
    const s = this.summary();
    return [
      { label: 'Employees in the system', value: s?.total_employees },
      { label: 'Open projects', value: s?.open_requirements },
      { label: 'Free this month', value: s?.available_employees },
      { label: 'Waiting for approval', value: s?.pending_decisions }
    ];
  });

  readonly byCategory = computed<BarRow[]>(() =>
    toCounts(this.summary()?.matches_by_category).map(({ key, count }) => {
      const k = key.toUpperCase() as MatchCategory;
      return k in CATEGORIES
        ? { label: CATEGORIES[k].label, count, color: CATEGORY_BAR[k] }
        : { label: humanise(key), count };
    })
  );
  readonly byDecision = computed<BarRow[]>(() =>
    toCounts(this.summary()?.decisions_by_type).map(({ key, count }) => ({ label: DECISION_TEXT[key.toUpperCase()] ?? humanise(key), count }))
  );
  readonly byRunStatus = computed<BarRow[]>(() =>
    toCounts(this.summary()?.runs_by_status).map(({ key, count }) => ({ label: humanise(key), count }))
  );

  // Skill-gap summary: no filters = whole workforce, latest run of each requirement.
  readonly gaps = signal<GapSummary | null>(null);
  readonly gapError = signal<ApiError | null>(null);
  readonly gapTiles = computed(() => {
    const g = this.gaps();
    return [
      { label: 'Skill gaps', value: g?.total_gaps ?? 0 },
      { label: 'People with gaps', value: g?.employees_with_gaps ?? 0 },
      { label: 'Must-have gaps', value: g?.mandatory_gaps ?? 0 },
      { label: 'Gaps without a learning plan', value: g?.gaps_without_recommendation ?? 0 }
    ];
  });
  readonly gapByPriority = computed<BarRow[]>(() =>
    PRIORITY_ORDER.map(p => ({ label: priorityInfo(p).label, count: this.gaps()?.by_priority?.[p] ?? 0, color: PRIORITY_BAR[p] }))
  );

  readonly logPageSize = LOG_PAGE_SIZE;
  readonly logPage = signal(1);
  readonly logFrom = signal('');
  readonly logTo = signal('');
  private auth = inject(AuthService);
  // The activity log is shown only to these roles.
  readonly canSeeLogs = computed(() => this.auth.hasAnyRole(...LOG_ROLES));
  readonly filteredLogs = computed(() => {
    const from = this.logFrom(), to = this.logTo();
    const list = this.logs() ?? [];
    if (!from && !to) return list;
    return list.filter(l => {
      const d = parseTimestamp(l.action_timestamp);
      if (!d) return false;
      const day = toIsoDate(d);
      return (!from || day >= from) && (!to || day <= to);
    });
  });
  readonly logPages = computed(() => Math.max(1, Math.ceil(this.filteredLogs().length / LOG_PAGE_SIZE)));
  readonly pagedLogs = computed(() => {
    const start = (this.logPage() - 1) * LOG_PAGE_SIZE;
    return this.filteredLogs().slice(start, start + LOG_PAGE_SIZE);
  });

  // The API's user field name varies; check the likely ones, then any key that looks like a user/actor.
  userOf(l: AuditLog): string {
    const rec = l as Record<string, unknown>;
    const known = ['performed_by', 'action_by', 'username', 'user_name', 'userName', 'user', 'changed_by', 'created_by', 'actor', 'employee_name', 'performedBy'];
    for (const k of known) {
      const v = rec[k];
      if (typeof v === 'string' && v.trim()) return v;
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        const name = o['username'] ?? o['name'] ?? o['full_name'];
        if (typeof name === 'string' && name.trim()) return name;
      }
    }
    const idKey = Object.keys(rec).find(k => /(user|actor|by)/i.test(k) && rec[k] != null && rec[k] !== '');
    return idKey ? String(rec[idKey]) : '-';
  }

  readonly formatDateTime = formatDateTime;
  readonly humanise = humanise;

  ngOnInit(): void {
    this.loadSummary();
    this.loadGapSummary();
    if (this.canSeeLogs()) this.loadLogs();
  }

  loadSummary(): void {
    this.summaryError.set(null);
    this.requirementsApi.getDashboardSummary().subscribe({
      next: s => this.summary.set(s),
      error: err => this.summaryError.set(toApiError(err))
    });
  }

  loadGapSummary(): void {
    this.gapError.set(null);
    this.learning.gapSummary({ topN: 10 }).subscribe({
      next: g => this.gaps.set({ ...g, most_common_gap_skills: g.most_common_gap_skills ?? [] }),
      error: err => this.gapError.set(toApiError(err))
    });
  }

  loadLogs(): void {
    this.logs.set(null);
    this.logsError.set(null);
    this.logPage.set(1);
    this.requirementsApi.getAuditLogs(200).subscribe({
      next: list => this.logs.set(list ?? []),
      error: err => { this.logs.set([]); this.logsError.set(toApiError(err)); }
    });
  }

  downloadMatches(): void {
    const id = this.exportId();
    if (id) this.download('matches', this.requirementsApi.exportMatches(id), `matches-${this.selectedProject()?.projectCode ?? id}.xlsx`);
  }

  downloadDecisions(): void {
    const id = this.exportId();
    this.download('decisions', this.decisionsApi.exportDecisions(id), id ? `decisions-${this.selectedProject()?.projectCode ?? id}.xlsx` : 'decisions.xlsx');
  }

  private download(kind: 'matches' | 'decisions', source: Observable<HttpResponse<Blob>>, name: string): void {
    this.downloading.set(kind);
    source.subscribe({
      next: res => {
        this.downloading.set(null);
        saveBlob(res, name);
        this.toast.success('Download started.');
      },
      error: err => {
        this.downloading.set(null);
        this.toast.error(`Download failed: ${toApiError(err).title}`);
      }
    });
  }
}
