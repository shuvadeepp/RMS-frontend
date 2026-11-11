import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { ApiError, toApiError } from '../core/error-message';
import { LearningPathway } from '../models/learning-pathway.model';
import { LearningService } from '../services/learning.service';
import { ErrorBoxComponent } from './error-box.component';
import { humanise, priorityInfo, sourceInfo, statusPill } from './labels';

// Ordered learning steps for one person, with hours / weeks totals. Rejected steps are greyed and not counted.
@Component({
  selector: 'app-learning-pathway',
  imports: [ErrorBoxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error()) {
      <app-error-box [error]="error()!" (retry)="load()" />
    } @else if (!pathway()) {
      <div class="state" role="status"><span class="spinner"></span> Loading pathway...</div>
    } @else {
      @let p = pathway()!;
      @if (p.steps.length === 0) {
        <p class="state">No learning steps yet.</p>
      } @else {
        <ul class="totals" aria-label="Pathway totals">
          <li>
            @if (p.totals.estimated_steps > 0) {
              <strong>{{ p.totals.total_estimated_hours }} h, about {{ p.totals.total_estimated_weeks }} weeks</strong>
              <span class="muted small"> (steps done one after another)</span>
            } @else {
              <strong>No time estimate yet</strong>
            }
          </li>
          <li><strong>{{ p.totals.awaiting_lk_review }}</strong> waiting for L&amp;K review</li>
          <li><strong>{{ p.totals.ai_generated_steps }}</strong> written by AI</li>
        </ul>
        @for (n of p.notes ?? []; track $index) { <p class="muted small info">{{ n }}</p> }

        <ol class="steps">
          @for (s of p.steps; track s.learning_recommendation_id) {
            <li class="step" [class.rejected]="s.review_status === 'REJECTED'">
              <span class="num">{{ s.step }}</span>
              <div class="body">
                <div class="top">
                  <span class="list-title">{{ s.skill_name }}</span>
                  @if (s.priority) { <span class="pill" [class]="priorityInfo(s.priority).css">{{ priorityInfo(s.priority).label }}</span> }
                  @let src = sourceInfo(s.recommendation_source);
                  <span class="pill" [class]="src.css" [attr.title]="src.tip">{{ src.label }}</span>
                  <span class="pill" [class]="statusPill(s.review_status)">{{ humanise(s.review_status) }}</span>
                </div>
                @if (s.learning_action) { <p class="small">{{ s.learning_action }}</p> }
                <p class="muted small">
                  @if (s.estimated_hours) { ~{{ s.estimated_hours }} h@if (s.estimated_weeks) {, about {{ s.estimated_weeks }} week(s)} }
                  @else { Estimate not available }
                  @if (s.validation_method) { · Validation: {{ humanise(s.validation_method) }} }
                </p>
              </div>
            </li>
          }
        </ol>
      }
    }
  `,
  styles: `
    .totals { list-style: none; margin: 0 0 10px; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 14px; }
    .info { margin: 0 0 6px; }
    .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .step { display: flex; gap: 12px; padding: 12px; border-radius: 12px; background: var(--bg); }
    .step.rejected { opacity: .55; }
    .num { flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--primary); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 13px; }
    .body { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  `
})
export class LearningPathwayComponent {
  private learning = inject(LearningService);

  readonly matchingResultId = input.required<number>();
  // Change this value to make the pathway reload (for example after a review).
  readonly refresh = input<unknown>(null);

  readonly pathway = signal<LearningPathway | null>(null);
  readonly error = signal<ApiError | null>(null);

  readonly humanise = humanise;
  readonly statusPill = statusPill;
  readonly priorityInfo = priorityInfo;
  readonly sourceInfo = sourceInfo;

  constructor() {
    effect(() => {
      this.matchingResultId();
      this.refresh();
      untracked(() => this.load());
    });
  }

  load(): void {
    this.error.set(null);
    this.learning.getPathway(this.matchingResultId()).subscribe({
      next: p => this.pathway.set({ ...p, steps: p.steps ?? [] }),
      error: err => this.error.set(toApiError(err))
    });
  }
}
