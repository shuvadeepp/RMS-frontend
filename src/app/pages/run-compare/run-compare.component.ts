import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ApiError, toApiError } from '../../core/error-message';
import { CompareEmployee, CompareRun, GapChange, RunCompare } from '../../models/evidence-rematch.model';
import { Requirement } from '../../models/requirement.model';
import { LearningService } from '../../services/learning.service';
import { RequirementService } from '../../services/requirement.service';
import { ErrorBoxComponent } from '../../shared/error-box.component';
import { IconComponent } from '../../shared/icon.component';
import { categoryOf, formatDateTime, humanise, priorityInfo } from '../../shared/labels';

const STATUS_PILL: Record<GapChange['status'], { label: string; css: string }> = {
  CLOSED: { label: 'Closed', css: 'pill-success' },
  IMPROVED: { label: 'Improved', css: 'pill-lightgreen' },
  UNCHANGED: { label: 'Unchanged', css: 'pill-neutral' },
  WORSENED: { label: 'Worsened', css: 'pill-danger' },
  NEW: { label: 'New gap', css: 'pill-orange' }
};

// Before / after view of a rematch: who moved, which gaps closed.
@Component({
  selector: 'app-run-compare',
  imports: [RouterLink, ErrorBoxComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <a class="back-link" routerLink="/skill-growth" [queryParams]="backQuery()"><app-icon name="arrow-left" [size]="18" /> Back to skill growth</a>
      <header>
        <p class="eyebrow">Before and after</p>
        <h1 class="page-title">What changed after the rematch</h1>
      </header>

      @if (loading()) {
        <div class="card state" role="status"><span class="spinner"></span> Loading comparison...</div>
      } @else if (error()) {
        <app-error-box [error]="error()!" (retry)="load()" />
      } @else if (data()) {
        @let d = data()!;
        <div class="grid grid-2">
          @for (run of [d.old_run, d.new_run]; track run.matching_run_id; let i = $index) {
            <section class="card run">
              <p class="eyebrow">{{ i === 0 ? 'Before (older run)' : 'After (new run)' }}</p>
              <h2 class="section-title">Run #{{ run.matching_run_id }}</h2>
              <p class="muted small">
                {{ humanise(run.run_trigger) }} · {{ humanise(run.run_status) }}<br />
                {{ formatDateTime(run.completed_at || run.execution_date) }}
              </p>
              @if (run.rematch_note) { <p class="small">Note: {{ run.rematch_note }}</p> }
            </section>
          }
        </div>
        <div class="row links">
          @if (oldRunLink(); as l) {
            <a class="btn btn-sm" routerLink="/skill-growth" [queryParams]="l">View older run</a>
          }
          <a class="btn btn-sm" routerLink="/skill-growth" [queryParams]="backQuery()">View new run</a>
        </div>

        <div class="grid grid-4">
          @for (t of tiles(); track t.label) {
            <div class="card tile">
              <span class="tile-value" [class]="t.css">{{ t.value }}</span>
              <span class="tile-label">{{ t.label }}</span>
            </div>
          }
        </div>

        <div class="card table-wrap">
          <table>
            <caption class="sr-only">Score, category and rank before and after, biggest improvement first</caption>
            <thead>
              <tr><th scope="col">Person</th><th scope="col">Score</th><th scope="col">Category</th><th scope="col">Rank</th><th scope="col"><span class="sr-only">Details</span></th></tr>
            </thead>
            <tbody>
              @for (e of d.employees; track e.employee_id) {
                <tr>
                  <td>
                    <strong>{{ e.resource_name }}</strong><br /><span class="muted small">{{ e.employee_code }}</span>
                    @if (e.only_in === 'NEW_RUN') { <br /><span class="pill pill-info">Only in new run</span> }
                    @else if (e.only_in === 'OLD_RUN') { <br /><span class="pill pill-neutral">Only in old run</span> }
                  </td>
                  <td>
                    {{ scoreText(e.old_score) }} → {{ scoreText(e.new_score) }}
                    @if (!e.only_in && e.score_change !== undefined && e.score_change !== null) {
                      <span class="change" [class.up]="e.score_change > 0" [class.down]="e.score_change < 0">{{ signed(e.score_change) }}</span>
                    }
                  </td>
                  <td>
                    {{ catText(e.old_category) }} → <span [class.changed]="e.category_changed">{{ catText(e.new_category) }}</span>
                  </td>
                  <td>
                    {{ e.old_rank ?? '-' }} → {{ e.new_rank ?? '-' }}
                    @if (!e.only_in && e.rank_change) {
                      @if (e.rank_change > 0) { <span class="change up" [attr.title]="'Moved up ' + e.rank_change">▲ {{ e.rank_change }}</span> }
                      @else { <span class="change down" [attr.title]="'Moved down ' + -e.rank_change">▼ {{ -e.rank_change }}</span> }
                    }
                  </td>
                  <td>
                    @if (!e.only_in) {
                      <button type="button" class="btn btn-sm" [attr.aria-expanded]="isOpen(e)" (click)="toggle(e)">{{ isOpen(e) ? 'Hide gaps' : 'Gap changes' }}</button>
                    }
                  </td>
                </tr>
                @if (isOpen(e)) {
                  <tr class="detail">
                    <td colspan="5">
                      @if (e.gaps_comparable === false) {
                        <p class="muted small">Gap details are not available for the older run.</p>
                      } @else if (!e.gap_changes?.length) {
                        <p class="muted small">No gaps in either run.</p>
                      } @else {
                        <ul class="list">
                          @for (g of e.gap_changes; track g.skill_id) {
                            <li class="gap">
                              <span class="list-title">{{ g.skill_name }}</span>
                              @if (g.mandatory) { <span class="muted small">must-have</span> }
                              <span class="pill" [class]="statusOf(g).css">{{ statusOf(g).label }}</span>
                              <span class="small">{{ levelText(g.old_gap_type, g.old_level) }} → {{ levelText(g.new_gap_type, g.new_level) }} (needs {{ g.required_level }})</span>
                              @if (g.old_priority || g.new_priority) {
                                <span class="muted small">priority {{ prioText(g.old_priority) }} → {{ prioText(g.new_priority) }}</span>
                              }
                            </li>
                          }
                        </ul>
                      }
                    </td>
                  </tr>
                }
              } @empty {
                <tr><td colspan="5" class="muted">No people to compare.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: `
    .links { gap: 8px; flex-wrap: wrap; }
    .run { display: flex; flex-direction: column; gap: 4px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding: 8px 10px; border-bottom: 1px solid var(--border); }
    td { padding: 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
    .detail td { background: var(--bg); }
    .change { margin-left: 6px; font-weight: 800; color: var(--muted); }
    .change.up, .tile-value.up { color: var(--excellent-text); }
    .change.down, .tile-value.down { color: var(--danger-text); }
    .changed { font-weight: 800; color: var(--primary-dark); }
    .gap { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 4px 0; }
  `
})
export class RunCompareComponent {
  private route = inject(ActivatedRoute);
  private learning = inject(LearningService);
  private requirements = inject(RequirementService);

  private params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  readonly runId = computed(() => Number(this.params().get('runId')) || null);
  readonly withRunId = computed(() => Number(this.query().get('withRunId')) || null);

  readonly data = signal<RunCompare | null>(null);
  readonly requirement = signal<Requirement | null>(null);
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);
  readonly openIds = signal<ReadonlySet<number>>(new Set());

  readonly formatDateTime = formatDateTime;
  readonly humanise = humanise;

  // Skill Growth needs the project id, which comes from the requirement.
  readonly backQuery = computed(() => ({ projectId: this.requirement()?.project_id ?? null }));
  readonly oldRunLink = computed(() => {
    const d = this.data();
    const projectId = this.requirement()?.project_id;
    return d && projectId ? { projectId, runId: d.old_run.matching_run_id } : null;
  });

  readonly tiles = computed(() => {
    const s = this.data()?.summary;
    const avg = s?.average_score_change;
    return [
      { label: 'Improved', value: s?.improved ?? 0, css: (s?.improved ?? 0) > 0 ? 'up' : '' },
      { label: 'Declined', value: s?.declined ?? 0, css: (s?.declined ?? 0) > 0 ? 'down' : '' },
      { label: 'Unchanged', value: s?.unchanged ?? 0, css: '' },
      { label: 'Average score change', value: avg === null || avg === undefined ? '-' : this.signed(avg), css: !avg ? '' : avg > 0 ? 'up' : 'down' },
      { label: 'Gaps closed', value: s?.gaps_closed ?? 0, css: (s?.gaps_closed ?? 0) > 0 ? 'up' : '' },
      { label: 'New gaps', value: s?.new_gaps ?? 0, css: (s?.new_gaps ?? 0) > 0 ? 'down' : '' }
    ];
  });

  constructor() {
    effect(() => {
      this.runId();
      this.withRunId();
      untracked(() => this.load());
    });
  }

  load(): void {
    const id = this.runId();
    if (!id) {
      this.loading.set(false);
      this.error.set({ status: 400, title: 'No run chosen.', detail: null, rootCause: null, retryable: false });
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.openIds.set(new Set());
    this.learning.compareRuns(id, this.withRunId()).subscribe({
      next: d => {
        this.data.set({ ...d, employees: d.employees ?? [] });
        this.loading.set(false);
        this.requirements.getRequirement(d.requirement_id).pipe(catchError(() => of(null))).subscribe(r => this.requirement.set(r));
      },
      error: err => {
        // 400 here means the run has no previous run to compare with.
        this.error.set(toApiError(err));
        this.loading.set(false);
      }
    });
  }

  isOpen(e: CompareEmployee): boolean {
    return this.openIds().has(e.employee_id);
  }

  toggle(e: CompareEmployee): void {
    this.openIds.update(s => {
      const next = new Set(s);
      if (!next.delete(e.employee_id)) next.add(e.employee_id);
      return next;
    });
  }

  statusOf(g: GapChange): { label: string; css: string } {
    return STATUS_PILL[g.status] ?? { label: humanise(g.status), css: 'pill-neutral' };
  }

  signed(n: number): string {
    const v = Math.round(n * 100) / 100;
    return v > 0 ? `+${v}` : `${v}`;
  }

  scoreText(n: number | null): string {
    return n === null || n === undefined ? '-' : String(Math.round(n * 10) / 10);
  }

  catText(c: string | null): string {
    return c ? categoryOf(null, c).label : '-';
  }

  prioText(p: string | null): string {
    return p ? priorityInfo(p).label : 'none';
  }

  // "missing" when the skill is not held, "no gap" when that run had no gap for it.
  levelText(gapType: string | null, level: number | null): string {
    if (gapType === null) return 'no gap';
    if (level === null) return gapType === 'MISSING' ? 'missing' : 'not rated';
    return `level ${level}`;
  }
}
