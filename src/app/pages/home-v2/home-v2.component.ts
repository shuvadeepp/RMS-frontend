import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ApiError, toApiError } from '../../core/error-message';
import { AuditLog, BenchSkill, BenchSkillsResponse, DashboardSummary, MatchingRun, PendingDecisionItem, PendingDecisionsResponse } from '../../models/requirement.model';
import { AuthService } from '../../services/auth.service';
import { RequirementService } from '../../services/requirement.service';
import { IconComponent } from '../../shared/icon.component';
import { formatDate, humanise, initials, parseTimestamp, toCounts } from '../../shared/labels';

// Each card owns its load state so one slow or failing call never blocks another card.
type Load<T> =
  | { state: 'loading' }
  | { state: 'ready'; data: T }
  | { state: 'error'; error: ApiError };

const LOADING = { state: 'loading' } as const;

interface DecisionItem {
  key: string;
  requirementId: number | null;
  name: string;
  subtitle: string;
  score: number | null;
  initials: string;
  statusLabel: string;
  statusCss: string;
}

interface ActivityItem {
  key: number;
  text: string;
  colour: 'success' | 'danger' | 'info' | 'muted';
  when: string;
}

interface BenchRow {
  label: string;
  count: number;
  percent: number;
}

interface Kpi {
  label: string;
  value: number | null;
  sub: string;
  amber: boolean;
}

interface Slice {
  label: string;
  value: number;
  colour: string;
  dash: number;
  offset: number;
}

interface Bar {
  label: string;
  value: number | null;
  percent: number;
}

const DECISIONS_SHOWN = 2;
const DONUT_RADIUS = 52;
const DONUT_LENGTH = 2 * Math.PI * DONUT_RADIUS;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Home "Command center". Real data only: anything the API does not send yet shows "Not available yet".
@Component({
  selector: 'app-home-v2',
  imports: [RouterLink, NgTemplateOutlet, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-v2.component.html',
  styleUrl: './home-v2.component.scss'
})
export class HomeV2Component implements OnInit {
  private api = inject(RequirementService);
  private destroyRef = inject(DestroyRef);
  readonly user = inject(AuthService).user;

  readonly summary = signal<Load<DashboardSummary>>(LOADING);
  readonly decisions = signal<Load<PendingDecisionsResponse>>(LOADING);
  readonly bench = signal<Load<BenchRow[]>>(LOADING);
  readonly activity = signal<Load<ActivityItem[]>>(LOADING);

  readonly skeletonRows = [1, 2, 3];
  readonly donutRadius = DONUT_RADIUS;
  readonly initials = initials;

  // ---------- Header ----------
  private readonly now = new Date();
  readonly eyebrow = `Home · ${WEEKDAYS[this.now.getDay()]} ${this.now.getDate()} ${MONTHS[this.now.getMonth()]}`;
  readonly greeting = (() => {
    const h = this.now.getHours();
    return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  })();
  readonly fullName = computed(() => this.user()?.fullName || this.user()?.username || '');

  private readonly data = computed(() => {
    const s = this.summary();
    return s.state === 'ready' ? s.data : null;
  });
  private readonly pendingData = computed(() => {
    const d = this.decisions();
    return d.state === 'ready' ? d.data : null;
  });
  // `total` from /decisions/pending; falls back to the summary count while that call is loading or failed.
  readonly pending = computed(() => this.pendingData()?.total ?? this.data()?.pending_decisions ?? null);
  readonly subline = computed(() => {
    const n = this.pending();
    if (n === null) return '';
    return n === 0 ? 'Nothing is waiting for your decision.' : `${n} ${n === 1 ? 'decision needs' : 'decisions need'} you today.`;
  });

  // ---------- KPI row ----------
  readonly kpis = computed<Kpi[]>(() => {
    const s = this.data();
    const oldest = this.pendingData()?.oldest_waiting_days;
    return [
      { label: 'Employees', value: s?.total_employees ?? null, sub: 'In the system', amber: false },
      { label: 'Open projects', value: s?.open_requirements ?? null, sub: 'Looking for people', amber: false },
      { label: 'Free this month', value: s?.available_employees ?? null, sub: 'Available to allocate', amber: false },
      {
        label: 'Waiting for approval',
        value: s?.pending_decisions ?? null,
        sub: typeof oldest === 'number' ? `Oldest waiting ${oldest} ${oldest === 1 ? 'day' : 'days'}` : 'Need a decision',
        amber: true
      }
    ];
  });

  // ---------- AI matching hero ----------
  private readonly lastRun = computed<MatchingRun | null>(() => {
    const runs = [...(this.data()?.recent_runs ?? [])];
    runs.sort((a, b) => (parseTimestamp(b.execution_date)?.getTime() ?? 0) - (parseTimestamp(a.execution_date)?.getTime() ?? 0)
      || b.matching_run_id - a.matching_run_id);
    return runs[0] ?? null;
  });
  readonly lastRunLine = computed(() => {
    const run = this.lastRun();
    if (!run) return 'No matching runs yet';
    const parts = [`Last run: ${relativeTime(run.execution_date) || `run #${run.matching_run_id}`}`];
    if (run.result_count !== null && run.result_count !== undefined) parts.push(`${run.result_count} matches`);
    return parts.join(' · ');
  });

  // ---------- Utilization donut ----------
  // The API only knows who is free this month; the allocated / approved-not-allocated split is not sent yet.
  readonly slices = computed<Slice[]>(() => {
    const s = this.data();
    if (!s || !s.total_employees) return [];
    const free = Math.min(Math.max(s.available_employees ?? 0, 0), s.total_employees);
    const parts = [
      { label: 'Free this month', value: free, colour: 'var(--excellent-ring)' },
      { label: 'Not free this month', value: s.total_employees - free, colour: 'var(--primary)' }
    ];
    let offset = 0;
    return parts.map(p => {
      const dash = (p.value / s.total_employees) * DONUT_LENGTH;
      const slice = { ...p, dash, offset };
      offset += dash;
      return slice;
    });
  });
  readonly freePercent = computed(() => {
    const s = this.data();
    return s && s.total_employees ? Math.round(((s.available_employees ?? 0) / s.total_employees) * 100) : null;
  });
  readonly donutLength = DONUT_LENGTH;

  // ---------- Hiring pipeline ----------
  // Shortlisted and Allocated totals are not in the summary yet (value null = "Not available yet").
  readonly pipeline = computed<Bar[]>(() => {
    const s = this.data();
    if (!s) return [];
    const matches = s.matches_by_category ? toCounts(s.matches_by_category).reduce((sum, c) => sum + c.count, 0) : null;
    const approved = s.decisions_by_type
      ? toCounts(s.decisions_by_type).filter(c => c.key.toUpperCase() === 'SELECTED').reduce((sum, c) => sum + c.count, 0)
      : null;
    const rows: Array<{ label: string; value: number | null }> = [
      { label: 'Requirements', value: s.open_requirements ?? null },
      { label: 'AI matches found', value: matches },
      { label: 'Shortlisted', value: null },
      { label: 'Approved', value: approved },
      { label: 'Allocated', value: null }
    ];
    const max = Math.max(1, ...rows.map(r => r.value ?? 0));
    return rows.map(r => ({ ...r, percent: r.value === null ? 0 : Math.max(r.value > 0 ? 3 : 0, Math.round((r.value / max) * 100)) }));
  });

  readonly decisionItems = computed<DecisionItem[]>(() =>
    (this.pendingData()?.items ?? []).slice(0, DECISIONS_SHOWN).map(toDecisionItem)
  );
  readonly benchRows = computed(() => {
    const b = this.bench();
    return b.state === 'ready' ? b.data : [];
  });
  readonly activityItems = computed(() => {
    const a = this.activity();
    return a.state === 'ready' ? a.data : [];
  });

  errorTitle(card: 'summary' | 'decisions' | 'activity' | 'bench'): string {
    const load = card === 'summary' ? this.summary() : card === 'decisions' ? this.decisions() : card === 'bench' ? this.bench() : this.activity();
    return load.state === 'error' ? load.error.title : '';
  }

  retryLoad(card: 'summary' | 'decisions' | 'activity' | 'bench'): void {
    if (card === 'summary') this.loadSummary();
    else if (card === 'decisions') this.loadDecisions();
    else if (card === 'bench') this.loadBench();
    else this.loadActivity();
  }

  ngOnInit(): void {
    this.loadSummary();
    this.loadDecisions();
    this.loadBench();
    this.loadActivity();
  }

  loadSummary(): void {
    this.summary.set(LOADING);
    this.api.getDashboardSummary().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => this.summary.set({ state: 'ready', data }),
      error: err => this.summary.set({ state: 'error', error: toApiError(err) })
    });
  }

  loadDecisions(): void {
    this.decisions.set(LOADING);
    this.api.getPendingDecisions(DECISIONS_SHOWN).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => this.decisions.set({ state: 'ready', data }),
      error: err => this.decisions.set({ state: 'error', error: toApiError(err) })
    });
  }

  loadBench(): void {
    this.bench.set(LOADING);
    this.api.getBenchSkills(4).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => this.bench.set({ state: 'ready', data: toBenchRows(res) }),
      error: err => this.bench.set({ state: 'error', error: toApiError(err) })
    });
  }

  loadActivity(): void {
    this.activity.set(LOADING);
    this.api.getAuditLogs(4).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: logs => this.activity.set({ state: 'ready', data: (logs ?? []).slice(0, 4).map(toActivity) }),
      error: err => this.activity.set({ state: 'error', error: toApiError(err) })
    });
  }
}

function toDecisionItem(item: PendingDecisionItem, index: number): DecisionItem {
  const name = item.employee_name ?? item.employee_code ?? 'Unknown';
  const approved = (item.status ?? '').toUpperCase() === 'APPROVED_PENDING';
  const subtitle = [item.designation ?? item.role_name, item.project_name].filter(Boolean).join(' · ');
  return {
    key: String(item.matching_result_id ?? `${item.requirement_id}-${item.employee_id ?? index}`),
    requirementId: item.requirement_id ?? null,
    name,
    subtitle,
    score: typeof item.score === 'number' ? Math.round(item.score) : null,
    initials: initials(name),
    statusLabel: approved ? 'Confirm allocation' : 'Shortlisted',
    statusCss: approved ? 'pill-success' : 'pill-warning'
  };
}

// Accepts a bare list or {items} / {skills}; the count may be named count, employee_count or available_count.
function toBenchRows(res: BenchSkillsResponse | null | undefined): BenchRow[] {
  const list: BenchSkill[] = Array.isArray(res) ? res : res?.items ?? res?.skills ?? [];
  const rows = list
    .map(s => ({ label: s.skill_name ?? s.skill ?? s.name ?? '', count: s.count ?? s.employee_count ?? s.available_count ?? 0 }))
    .filter(r => r.label)
    .slice(0, 4);
  const max = Math.max(1, ...rows.map(r => r.count));
  return rows.map(r => ({ ...r, percent: Math.max(r.count > 0 ? 3 : 0, Math.round((r.count / max) * 100)) }));
}

function toActivity(log: AuditLog, index: number): ActivityItem {
  const action = log.action ?? log.action_type ?? '';
  const entity = log.entity_name ?? log.entity ?? '';
  const who = log.performed_by ?? log.action_by ?? log.username ?? '';
  const record = log.record_id !== null && log.record_id !== undefined && log.record_id !== '' ? ` #${log.record_id}` : '';
  const what = [humanise(action), entity ? entity.replace(/_/g, ' ').toLowerCase() + record : ''].filter(Boolean).join(' ');
  const upper = action.toUpperCase();
  const colour: ActivityItem['colour'] =
    /REJECT|FAIL|DELETE|REMOVE|RELEASE/.test(upper) ? 'danger'
      : /SELECT|APPROV|ALLOCAT|COMPLETE|SUCCESS/.test(upper) ? 'success'
        : /CREATE|SHORTLIST|MATCH|RUN|UPDATE|REVIEW/.test(upper) ? 'info'
          : 'muted';
  return {
    key: log.audit_log_id ?? log.id ?? index,
    text: [who, what || log.details || 'Activity'].filter(Boolean).join(' · '),
    colour,
    when: relativeTime(log.action_timestamp)
  };
}

// "5 min ago", "3 h ago", "2 d ago"; older than a week falls back to a date. Timestamps are IST wall-clock, read as-is.
function relativeTime(value: string | null | undefined): string {
  const date = parseTimestamp(value);
  if (!date) return '';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days <= 7 ? `${days} d ago` : formatDate(value);
}
