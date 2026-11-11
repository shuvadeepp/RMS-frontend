import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, switchMap, takeWhile, timer } from 'rxjs';
import { toApiError } from '../core/error-message';
import { ToastService } from '../core/toast.service';
import { RunStatus } from '../models/requirement.model';
import { AuthService } from '../services/auth.service';
import { LearningService } from '../services/learning.service';
import { RequirementService } from '../services/requirement.service';
import { REMATCH_ROLES, humanise } from './labels';

const POLL_MS = 2000;
const TERMINAL: RunStatus[] = ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'];

// "Rematch" button: asks for an optional note, starts a rematch run, polls it every 2 s
// and opens the before/after comparison when it finishes. Hidden for roles that cannot rematch.
@Component({
  selector: 'app-rematch-button',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (allowed()) {
      @if (phase() === 'idle') {
        <button type="button" class="btn btn-sm" (click)="phase.set('confirm')">{{ label() }}</button>
      } @else if (phase() === 'confirm') {
        <form class="panel" (ngSubmit)="start()" aria-label="Rematch">
          <p class="small">Score everyone again with their updated skills. The old results stay as they are, and the new run is shown next to them.</p>
          <div class="field">
            <label for="rm-note">Note <span class="hint">(optional)</span></label>
            <input id="rm-note" name="note" class="input" placeholder="After Docker training" [ngModel]="note()" (ngModelChange)="note.set($event)" />
          </div>
          <div class="row">
            <button type="submit" class="btn btn-primary btn-sm">Start rematch</button>
            <button type="button" class="btn btn-ghost btn-sm" (click)="phase.set('idle')">Cancel</button>
          </div>
        </form>
      } @else {
        <div class="panel" role="status" aria-live="polite">
          <span class="spinner"></span>
          @if (runId(); as id) { Run #{{ id }}: {{ humanise(status()) }}... } @else { Starting rematch... }
        </div>
      }
    }
  `,
  styles: `
    .panel { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 12px; background: var(--bg); border: 1px solid var(--border); max-width: 460px; }
    :host { display: inline-block; }
  `
})
export class RematchButtonComponent {
  private learning = inject(LearningService);
  private requirements = inject(RequirementService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  readonly requirementId = input.required<number | null>();
  readonly label = input('Rematch');

  readonly phase = signal<'idle' | 'confirm' | 'running'>('idle');
  readonly note = signal('');
  readonly runId = signal<number | null>(null);
  readonly status = signal<RunStatus>('QUEUED');
  readonly allowed = computed(() => this.requirementId() !== null && this.auth.hasAnyRole(...REMATCH_ROLES));
  readonly humanise = humanise;

  private pollSub: Subscription | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.pollSub?.unsubscribe());
  }

  start(): void {
    const reqId = this.requirementId();
    if (reqId === null) return;
    this.phase.set('running');
    this.runId.set(null);
    this.status.set('QUEUED');
    this.learning.rematch(reqId, { rematch_note: this.note().trim() || null }).subscribe({
      next: res => {
        this.runId.set(res.matching_run_id);
        this.poll(res.matching_run_id);
      },
      error: err => {
        this.phase.set('idle');
        const e = toApiError(err);
        // 409: no finished run or one is still running. 503: server busy. 403: wrong role.
        this.toast.error(e.status === 403 ? 'You do not have permission to rematch.' : e.title);
      }
    });
  }

  private poll(runId: number): void {
    this.pollSub?.unsubscribe();
    this.pollSub = timer(0, POLL_MS)
      .pipe(
        switchMap(() => this.requirements.getRun(runId)),
        takeWhile(run => !TERMINAL.includes(run.run_status), true)
      )
      .subscribe({
        next: run => {
          this.status.set(run.run_status);
          if (run.run_status === 'FAILED') {
            this.phase.set('idle');
            this.toast.error(run.error_message ?? 'The rematch failed.');
          } else if (run.run_status === 'COMPLETED' || run.run_status === 'COMPLETED_WITH_ERRORS') {
            this.phase.set('idle');
            this.router.navigate(['/compare', runId]);
          }
        },
        error: err => {
          this.phase.set('idle');
          this.toast.error(`Could not check the rematch: ${toApiError(err).title}`);
        }
      });
  }
}
