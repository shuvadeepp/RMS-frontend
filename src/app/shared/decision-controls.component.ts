import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toApiError } from '../core/error-message';
import { ToastService } from '../core/toast.service';
import { DecisionValue } from '../models/decision.model';
import { MatchResult } from '../models/requirement.model';
import { AuthService } from '../services/auth.service';
import { DecisionService } from '../services/decision.service';
import { IconComponent } from './icon.component';
import { matchStatus, nowTimestamp } from './labels';

type ReasonAction = Extract<DecisionValue, 'SELECTED' | 'ON_HOLD' | 'REJECTED'>;

const VERBS: Record<ReasonAction, { button: string; question: string; done: string }> = {
  SELECTED: { button: 'Approve', question: 'Why approve', done: 'approved' },
  ON_HOLD: { button: 'Hold', question: 'Why put on hold', done: 'put on hold' },
  REJECTED: { button: 'Reject', question: 'Why reject', done: 'rejected' }
};

// Shortlist toggle + Hold / Reject / Approve with a required reason.
// Updates are optimistic: `changed` fires at once and again with the original match if the call fails.
@Component({
  selector: 'app-decision-controls',
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = status();
    @if (s === 'ALLOCATED') {
      <p class="pill pill-success done"><app-icon name="check" [size]="16" /> Allocated</p>
    } @else {
      <div class="row">
        @if (s !== 'APPROVED') {
          <button type="button" class="btn" [class.btn-on]="isShortlisted()" [attr.aria-pressed]="isShortlisted()"
                  [disabled]="busy()" (click)="toggleShortlist()">
            <app-icon [name]="isShortlisted() ? 'check' : 'plus'" [size]="18" />
            {{ isShortlisted() ? 'Shortlisted' : 'Shortlist' }}
          </button>
        }
        @if (s !== 'ON_HOLD') {
          <button type="button" class="btn" [disabled]="busy()" (click)="open('ON_HOLD')">Hold</button>
        }
        @if (s !== 'REJECTED') {
          <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="open('REJECTED')">Reject</button>
        }
        @if (isShortlisted() && s !== 'APPROVED') {
          <button type="button" class="btn btn-success" [disabled]="busy()" (click)="open('SELECTED')">Approve</button>
        }
      </div>
    }

    @if (pending(); as action) {
      <form class="reason-form" (ngSubmit)="save()">
        <div class="field">
          <label [for]="fieldId">{{ verbs[action].question }} {{ match().resource_name }}? <span class="req">(required)</span></label>
          <textarea [id]="fieldId" name="reason" class="textarea" required
                    [ngModel]="reason()" (ngModelChange)="reason.set($event)"></textarea>
        </div>
        <div class="row">
          <button type="submit" class="btn btn-primary" [disabled]="!reason().trim() || busy()">
            Save: {{ verbs[action].button }}
          </button>
          <button type="button" class="btn btn-ghost" (click)="pending.set(null)">Cancel</button>
        </div>
      </form>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
    .btn-on { background: var(--primary-tint); border-color: var(--primary); color: var(--primary-dark); }
    .reason-form { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--border); padding-top: 12px; }
    .done { align-self: flex-start; padding: 8px 14px; font-size: 13px; }
  `
})
export class DecisionControlsComponent {
  private decisions = inject(DecisionService);
  private toast = inject(ToastService);
  private user = inject(AuthService).user;

  readonly match = input.required<MatchResult>();
  readonly requirementId = input.required<number>();
  readonly changed = output<MatchResult>();

  readonly verbs = VERBS;
  readonly pending = signal<ReasonAction | null>(null);
  readonly reason = signal('');
  readonly busy = signal(false);

  readonly status = computed(() => matchStatus(this.match()));
  readonly isShortlisted = computed(() => this.match().recommendation_status === 'RECOMMENDED');

  get fieldId(): string {
    return `reason-${this.match().matching_result_id}`;
  }

  open(action: ReasonAction): void {
    this.pending.set(action);
    this.reason.set('');
  }

  toggleShortlist(): void {
    const original = this.match();
    const id = original.matching_result_id;
    const on = !this.isShortlisted();
    this.busy.set(true);
    this.changed.emit({ ...original, recommendation_status: on ? 'RECOMMENDED' : 'REVIEW_REQUIRED' });

    (on ? this.decisions.shortlist(id) : this.decisions.unshortlist(id)).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(on ? `${original.resource_name} shortlisted.` : `${original.resource_name} removed from the shortlist.`);
      },
      error: err => {
        this.busy.set(false);
        this.changed.emit(original);
        this.toast.error(`Could not update the shortlist: ${toApiError(err).title}`);
      }
    });
  }

  save(): void {
    const action = this.pending();
    const reason = this.reason().trim();
    if (!action || !reason) return;

    const original = this.match();
    const optimistic: MatchResult = {
      ...original,
      recommendation_status: action === 'REJECTED' ? 'NOT_RECOMMENDED' : original.recommendation_status,
      current_decision: {
        allocation_decision_id: null,
        decision: action,
        decision_reason: reason,
        decision_maker: this.user()?.fullName ?? null,
        decision_date: nowTimestamp(),
        allocation_id: null
      }
    };
    this.busy.set(true);
    this.pending.set(null);
    this.changed.emit(optimistic);

    this.decisions.createDecision({
      matching_result_id: original.matching_result_id,
      requirement_id: this.requirementId(),
      decision: action,
      decision_reason: reason
    }).subscribe({
      next: res => {
        this.busy.set(false);
        this.changed.emit({
          ...optimistic,
          current_decision: { ...optimistic.current_decision!, allocation_decision_id: res.allocationDecisionId, allocation_id: res.allocationId }
        });
        this.toast.success(`${original.resource_name} ${VERBS[action].done}.`);
      },
      error: err => {
        this.busy.set(false);
        this.changed.emit(original);
        const e = toApiError(err);
        const text = e.status === 409 ? 'This person is already allocated.' : e.detail ?? e.title;
        this.toast.error(`Decision not saved: ${text}`);
      }
    });
  }
}
