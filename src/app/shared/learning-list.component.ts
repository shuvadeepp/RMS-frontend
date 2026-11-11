import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toApiError } from '../core/error-message';
import { ToastService } from '../core/toast.service';
import { EvidenceRecord, EvidenceResponse } from '../models/evidence-rematch.model';
import { LearningRecommendation, ReviewStatus } from '../models/requirement.model';
import { AuthService } from '../services/auth.service';
import { LearningService } from '../services/learning.service';
import { EvidenceFormComponent } from './evidence-form.component';
import { RematchButtonComponent } from './rematch-button.component';
import { EVIDENCE_ROLES, REVIEW_ROLES, formatDate, humanise, nowTimestamp, priorityInfo, priorityRank, sourceInfo, statusPill } from './labels';

interface PendingReview {
  id: number;
  status: Extract<ReviewStatus, 'APPROVED' | 'REJECTED'>;
}

// Learning recommendations with Approve / Reject / Start review (comment required to reject).
// Review buttons show only for ADMIN, LK_ADMIN and SKILL_REVIEWER; the backend answers 403 for everyone else.
@Component({
  selector: 'app-learning-list',
  imports: [FormsModule, EvidenceFormComponent, RematchButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="list">
      @for (r of sorted(); track r.learning_recommendation_id) {
        <li class="item">
          <div class="top">
            @if (r.sequence_order) { <span class="muted small">Step {{ r.sequence_order }}</span> }
            <span class="list-title">{{ r.skill_name }}</span>
            @if (r.current_proficiency !== null && r.current_proficiency !== undefined && r.target_proficiency) {
              <span class="muted small">level {{ r.current_proficiency }} to {{ r.target_proficiency }}</span>
            }
            <span class="spacer"></span>
            @if (r.priority) { <span class="pill" [class]="priorityInfo(r.priority).css">{{ priorityInfo(r.priority).label }}</span> }
            @let src = sourceInfo(r.recommendation_source);
            <span class="pill" [class]="src.css" [attr.title]="src.tip">{{ src.label }}</span>
            @if (r.resource_type) { <span class="pill pill-info">{{ humanise(r.resource_type) }}</span> }
            <span class="pill" [class]="statusPill(r.review_status)">{{ humanise(r.review_status) }}</span>
          </div>
          @if (r.learning_action) { <p class="small">{{ r.learning_action }}</p> }
          @if (r.learning_resource) {
            @if (r.recommendation_source === 'LK_REPOSITORY' && isUrl(r.learning_resource)) {
              <p class="muted small">Resource: <a [href]="r.learning_resource" target="_blank" rel="noopener">{{ r.learning_resource }}</a></p>
            } @else {
              <p class="muted small">Resource: {{ r.learning_resource }}</p>
            }
          }
          @if (r.estimated_hours || r.validation_method) {
            <p class="muted small">
              @if (r.estimated_hours) {
                ~{{ r.estimated_hours }} h@if (r.estimated_weeks) {, about {{ r.estimated_weeks }} week(s)}
              }
              @if (r.validation_method) {
                @if (r.estimated_hours) { · }
                Validation: {{ humanise(r.validation_method) }}
              }
            </p>
          }
          @if (r.review_comments) { <p class="muted small">Review note: "{{ r.review_comments }}"</p> }
          @if (r.review_status === 'IN_PROGRESS' && r.started_at) {
            <p class="muted small">In progress since {{ formatDate(r.started_at) }}</p>
          } @else if (r.started_at) {
            <p class="muted small">Started {{ formatDate(r.started_at) }}</p>
          }
          @if (r.completed_at) { <p class="muted small">Completed {{ formatDate(r.completed_at) }}</p> }

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
          } @else if (canReview()) {
            @if (r.review_status === 'PENDING') {
              <div class="row">
                <button type="button" class="btn btn-success btn-sm" (click)="open(r.learning_recommendation_id, 'APPROVED')">Approve</button>
                <button type="button" class="btn btn-danger btn-sm" (click)="open(r.learning_recommendation_id, 'REJECTED')">Reject</button>
              </div>
            } @else if (r.review_status === 'APPROVED') {
              <div class="row">
                <button type="button" class="btn btn-primary btn-sm" [disabled]="saving()" (click)="start(r)">Start learning</button>
              </div>
            }
          }

          @if (canEvidence() && (r.review_status === 'APPROVED' || r.review_status === 'IN_PROGRESS') && evidenceOpen() !== r.learning_recommendation_id) {
            <div class="row">
              <button type="button" class="btn btn-sm" (click)="evidenceOpen.set(r.learning_recommendation_id)">Record evidence</button>
            </div>
          }
          @if (evidenceOpen() === r.learning_recommendation_id) {
            <app-evidence-form [recommendationId]="r.learning_recommendation_id" (saved)="onEvidenceSaved(r, $event)" (cancelled)="evidenceOpen.set(null)" />
          }
          @if (results()[r.learning_recommendation_id]; as res) {
            <div class="result" role="status">
              <p class="small">
                <strong>{{ res.employee_skill.skill_name || r.skill_name }}:</strong>
                @if (res.employee_skill.changed) {
                  {{ res.employee_skill.old.proficiency ?? 'not rated' }} → {{ res.employee_skill.new.proficiency ?? 'not rated' }}
                  @if (res.employee_skill.new.validation_status) { ({{ humanise(res.employee_skill.new.validation_status) }}) }
                } @else { rating not changed }
              </p>
              <app-rematch-button [requirementId]="requirementId()" label="Rematch now" />
            </div>
          }
          @if (r.review_status === 'APPROVED' || r.review_status === 'IN_PROGRESS' || r.review_status === 'COMPLETED') {
            <details class="evidence" (toggle)="onEvidenceToggle(r.learning_recommendation_id, $event)">
              <summary>Evidence</summary>
              @let ev = evidenceCache()[r.learning_recommendation_id];
              @if (!ev || ev === 'loading') {
                <p class="muted small"><span class="spinner"></span> Loading...</p>
              } @else if (ev === 'error') {
                <p class="muted small">Could not load evidence.</p>
              } @else if (ev.length === 0) {
                <p class="muted small">No evidence recorded yet.</p>
              } @else {
                <ul class="list">
                  @for (e of ev; track e.evidence_id) {
                    <li class="small">
                      <strong>{{ e.evidence_title }}</strong>
                      <span class="muted"> · {{ humanise(e.evidence_type) }}
                        @if (e.score !== null && e.score !== undefined) { · {{ e.score }}/{{ e.maximum_score }} }
                        @if (e.evidence_date) { · {{ formatDate(e.evidence_date) }} } · {{ humanise(e.verification_status) }}</span>
                    </li>
                  }
                </ul>
              }
            </details>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .list { gap: 12px; }
    .item { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 12px; background: var(--bg); }
    .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .result { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 10px; background: var(--card); border: 1px solid var(--border); }
    .evidence { font-size: 13px; }
    .evidence summary { cursor: pointer; font-weight: 700; color: var(--primary-dark); }
    .review-form { display: flex; flex-direction: column; gap: 10px; }
  `
})
export class LearningListComponent {
  private learning = inject(LearningService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  readonly items = input.required<LearningRecommendation[]>();
  readonly changed = output<LearningRecommendation>();
  // Needed for the "Rematch now" button after evidence is saved.
  readonly requirementId = input<number | null>(null);

  readonly evidenceOpen = signal<number | null>(null);
  readonly results = signal<Record<number, EvidenceResponse>>({});
  readonly evidenceCache = signal<Record<number, EvidenceRecord[] | 'loading' | 'error'>>({});
  readonly canEvidence = computed(() => EVIDENCE_ROLES.includes(this.auth.role()));

  readonly pending = signal<PendingReview | null>(null);
  readonly comment = signal('');
  readonly saving = signal(false);

  // Most urgent first, then the step order from the backend.
  readonly sorted = computed(() =>
    [...this.items()].sort((a, b) =>
      priorityRank(a.priority) - priorityRank(b.priority) ||
      (a.sequence_order ?? Number.MAX_SAFE_INTEGER) - (b.sequence_order ?? Number.MAX_SAFE_INTEGER))
  );
  readonly canReview = computed(() => REVIEW_ROLES.includes(this.auth.role()));

  readonly humanise = humanise;
  readonly statusPill = statusPill;
  readonly priorityInfo = priorityInfo;
  readonly sourceInfo = sourceInfo;
  readonly formatDate = formatDate;

  onEvidenceSaved(r: LearningRecommendation, res: EvidenceResponse): void {
    this.evidenceOpen.set(null);
    this.results.update(m => ({ ...m, [r.learning_recommendation_id]: res }));
    // Forget the cached list so it reloads with the new entry.
    this.evidenceCache.update(m => {
      const next = { ...m };
      delete next[r.learning_recommendation_id];
      return next;
    });
    const lr = res.learning_recommendation;
    this.changed.emit({ ...r, review_status: lr.review_status, completed_at: lr.completed_at ?? r.completed_at ?? null });
    this.toast.success('Evidence saved.');
  }

  onEvidenceToggle(id: number, event: Event): void {
    if (!(event.target as HTMLDetailsElement).open || this.evidenceCache()[id]) return;
    this.evidenceCache.update(m => ({ ...m, [id]: 'loading' }));
    this.learning.listEvidence(id).subscribe({
      next: list => this.evidenceCache.update(m => ({ ...m, [id]: list ?? [] })),
      error: () => this.evidenceCache.update(m => ({ ...m, [id]: 'error' }))
    });
  }

  isUrl(value: string): boolean {
    return /^https?:\/\/\S+$/i.test(value.trim());
  }

  open(id: number, status: PendingReview['status']): void {
    this.pending.set({ id, status });
    this.comment.set('');
  }

  save(): void {
    const p = this.pending();
    if (!p) return;
    const original = this.items().find(r => r.learning_recommendation_id === p.id);
    if (!original) return;
    this.send(original, p.status, this.comment().trim(), `Learning plan for ${original.skill_name} ${p.status === 'APPROVED' ? 'approved' : 'rejected'}.`);
  }

  start(r: LearningRecommendation): void {
    this.send(r, 'IN_PROGRESS', '', `Learning for ${r.skill_name} started.`);
  }

  private send(original: LearningRecommendation, status: ReviewStatus, comment: string, success: string): void {
    this.saving.set(true);
    this.learning.review(original.learning_recommendation_id, { review_status: status, review_comments: comment }).subscribe({
      next: res => {
        this.saving.set(false);
        this.pending.set(null);
        // Fall back to what was sent when the response leaves a field out.
        this.changed.emit({
          ...original,
          ...(res ?? {}),
          review_status: res?.review_status ?? status,
          review_comments: res?.review_comments ?? comment,
          started_at: res?.started_at ?? original.started_at ?? (status === 'IN_PROGRESS' ? nowTimestamp() : null)
        });
        this.toast.success(success);
      },
      error: err => {
        this.saving.set(false);
        const e = toApiError(err);
        this.toast.error(e.status === 403
          ? 'Only L&K admins and skill reviewers can review learning plans.'
          : `Review not saved: ${e.title}`);
      }
    });
  }
}
