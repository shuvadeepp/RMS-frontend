import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toApiError } from '../core/error-message';
import { ToastService } from '../core/toast.service';
import { LearningRecommendation, ReviewStatus } from '../models/requirement.model';
import { LearningService } from '../services/learning.service';
import { humanise, statusPill } from './labels';

interface PendingReview {
  id: number;
  status: Extract<ReviewStatus, 'APPROVED' | 'REJECTED'>;
}

// Learning recommendations with Approve / Reject review (comment required to reject).
@Component({
  selector: 'app-learning-list',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="list">
      @for (r of items(); track r.learning_recommendation_id) {
        <li class="item">
          <div class="top">
            <span class="list-title">{{ r.skill_name }}</span>
            @if (r.current_proficiency !== null && r.current_proficiency !== undefined && r.target_proficiency) {
              <span class="muted small">level {{ r.current_proficiency }} to {{ r.target_proficiency }}</span>
            }
            <span class="spacer"></span>
            @if (r.resource_type) { <span class="pill pill-info">{{ humanise(r.resource_type) }}</span> }
            <span class="pill" [class]="statusPill(r.review_status)">{{ humanise(r.review_status) }}</span>
          </div>
          @if (r.learning_action) { <p class="small">{{ r.learning_action }}</p> }
          @if (r.learning_resource) { <p class="muted small">Resource: {{ r.learning_resource }}</p> }
          @if (r.review_comments) { <p class="muted small">Review note: "{{ r.review_comments }}"</p> }

          @if (pending()?.id === r.learning_recommendation_id) {
            <form class="review-form" (ngSubmit)="save()">
              <div class="field">
                <label [for]="'rc-' + r.learning_recommendation_id">
                  Comment @if (pending()!.status === 'REJECTED') { <span class="req">(required)</span> } @else { <span class="hint">(optional)</span> }
                </label>
                <input class="input" [id]="'rc-' + r.learning_recommendation_id" name="comment"
                       [ngModel]="comment()" (ngModelChange)="comment.set($event)" />
              </div>
              <div class="row">
                <button type="submit" class="btn btn-primary btn-sm" [disabled]="saving() || (pending()!.status === 'REJECTED' && !comment().trim())">
                  Save: {{ pending()!.status === 'APPROVED' ? 'Approve' : 'Reject' }}
                </button>
                <button type="button" class="btn btn-ghost btn-sm" (click)="pending.set(null)">Cancel</button>
              </div>
            </form>
          } @else if (r.review_status !== 'APPROVED' && r.review_status !== 'REJECTED' && r.review_status !== 'COMPLETED') {
            <div class="row">
              <button type="button" class="btn btn-success btn-sm" (click)="open(r.learning_recommendation_id, 'APPROVED')">Approve</button>
              <button type="button" class="btn btn-danger btn-sm" (click)="open(r.learning_recommendation_id, 'REJECTED')">Reject</button>
            </div>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .list { gap: 12px; }
    .item { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 12px; background: var(--bg); }
    .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .review-form { display: flex; flex-direction: column; gap: 10px; }
  `
})
export class LearningListComponent {
  private learning = inject(LearningService);
  private toast = inject(ToastService);

  readonly items = input.required<LearningRecommendation[]>();
  readonly changed = output<LearningRecommendation>();

  readonly pending = signal<PendingReview | null>(null);
  readonly comment = signal('');
  readonly saving = signal(false);

  readonly humanise = humanise;
  readonly statusPill = statusPill;

  open(id: number, status: PendingReview['status']): void {
    this.pending.set({ id, status });
    this.comment.set('');
  }

  save(): void {
    const p = this.pending();
    if (!p) return;
    const original = this.items().find(r => r.learning_recommendation_id === p.id);
    if (!original) return;
    const comment = this.comment().trim();

    this.saving.set(true);
    this.learning.review(p.id, { review_status: p.status, review_comments: comment }).subscribe({
      next: res => {
        this.saving.set(false);
        this.pending.set(null);
        // The response shape is not documented; fall back to what was sent.
        this.changed.emit({ ...original, ...(res ?? {}), review_status: res?.review_status ?? p.status, review_comments: res?.review_comments ?? comment });
        this.toast.success(`Learning plan for ${original.skill_name} ${p.status === 'APPROVED' ? 'approved' : 'rejected'}.`);
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(`Review not saved: ${toApiError(err).title}`);
      }
    });
  }
}
