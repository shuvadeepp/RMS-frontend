import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toApiError } from '../core/error-message';
import { EvidenceRequest, EvidenceResponse } from '../models/evidence-rematch.model';
import { EvidenceType } from '../models/requirement.model';
import { LearningService } from '../services/learning.service';
import { DatePickerComponent } from './date-picker.component';
import { humanise, toIsoDate } from './labels';

const TYPES: EvidenceType[] = ['ASSESSMENT', 'CERTIFICATION', 'PROJECT_EXPERIENCE', 'PRACTICAL_ASSIGNMENT', 'OTHER'];

// Form to record proof that a learning step was done. Can also update the person's skill rating.
@Component({
  selector: 'app-evidence-form',
  imports: [FormsModule, DatePickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="form" (ngSubmit)="submit()" aria-label="Record evidence">
      @if (formError()) { <p class="state state-error" role="alert">{{ formError() }}</p> }
      <div class="grid grid-2">
        <div class="field">
          <label [for]="id + '-type'">Evidence type</label>
          <select [id]="id + '-type'" name="evidence_type" class="select" [(ngModel)]="f.evidence_type">
            @for (t of types; track t) { <option [ngValue]="t">{{ humanise(t) }}</option> }
          </select>
          @if (err('evidence_type'); as e) { <span class="field-error">{{ e }}</span> }
        </div>
        <div class="field">
          <label [for]="id + '-title'">Title <span class="req">(required)</span></label>
          <input [id]="id + '-title'" name="evidence_title" class="input" [(ngModel)]="f.evidence_title" />
          @if (err('evidence_title'); as e) { <span class="field-error">{{ e }}</span> }
        </div>
      </div>
      <div class="field">
        <label [for]="id + '-desc'">Description</label>
        <textarea [id]="id + '-desc'" name="evidence_description" class="textarea" rows="2" [(ngModel)]="f.evidence_description"></textarea>
      </div>
      <div class="grid grid-4">
        <div class="field">
          <label [for]="id + '-score'">Score</label>
          <input [id]="id + '-score'" name="score" type="number" min="0" class="input" [(ngModel)]="f.score" />
          @if (err('score'); as e) { <span class="field-error">{{ e }}</span> }
        </div>
        <div class="field">
          <label [for]="id + '-max'">Maximum score</label>
          <input [id]="id + '-max'" name="maximum_score" type="number" min="0" class="input" [(ngModel)]="f.maximum_score" />
          @if (err('maximum_score'); as e) { <span class="field-error">{{ e }}</span> }
        </div>
        <div class="field">
          <label [for]="id + '-date'">Evidence date</label>
          <app-date-picker [inputId]="id + '-date'" name="evidence_date" [max]="today" [invalid]="!!err('evidence_date')" [(ngModel)]="f.evidence_date" />
          @if (err('evidence_date'); as e) { <span class="field-error">{{ e }}</span> }
        </div>
        <div class="field">
          <label [for]="id + '-valid'">Valid until</label>
          <app-date-picker [inputId]="id + '-valid'" name="valid_until" [min]="f.evidence_date || null" [invalid]="!!err('valid_until')" [(ngModel)]="f.valid_until" />
          @if (err('valid_until'); as e) { <span class="field-error">{{ e }}</span> }
        </div>
      </div>
      <div class="grid grid-2">
        <div class="field">
          <label [for]="id + '-file'">File reference or link</label>
          <input [id]="id + '-file'" name="file_reference" class="input" [(ngModel)]="f.file_reference" />
        </div>
        <div class="field">
          <label [for]="id + '-prof'">New proficiency (1-5)</label>
          <select [id]="id + '-prof'" name="new_proficiency" class="select" [(ngModel)]="f.new_proficiency">
            <option [ngValue]="null">Do not change the rating</option>
            @for (n of levels; track n) { <option [ngValue]="n">{{ n }}</option> }
          </select>
          <span class="hint">Updates the person's rating for this skill.</span>
          @if (err('new_proficiency'); as e) { <span class="field-error">{{ e }}</span> }
        </div>
      </div>
      <label class="check"><input type="checkbox" name="mark_completed" [(ngModel)]="f.mark_completed" /> Mark this learning step completed</label>
      <div class="row">
        <button type="submit" class="btn btn-primary btn-sm" [disabled]="saving()">
          @if (saving()) { <span class="spinner"></span> } Save evidence
        </button>
        <button type="button" class="btn btn-ghost btn-sm" (click)="cancelled.emit()">Cancel</button>
      </div>
    </form>
  `,
  styles: `
    .form { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 12px; background: var(--card); border: 1px solid var(--border); }
    .field-error { color: var(--danger-text); font-size: 12px; font-weight: 600; }
    .check { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 14px; }
  `
})
export class EvidenceFormComponent {
  private learning = inject(LearningService);

  readonly recommendationId = input.required<number>();
  readonly saved = output<EvidenceResponse>();
  readonly cancelled = output<void>();

  readonly types = TYPES;
  readonly levels = [1, 2, 3, 4, 5];
  readonly humanise = humanise;
  readonly today = toIsoDate(new Date());

  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});

  get id(): string {
    return 'ev-' + this.recommendationId();
  }

  f = {
    evidence_type: 'ASSESSMENT' as EvidenceType,
    evidence_title: '',
    evidence_description: '',
    score: null as number | null,
    maximum_score: null as number | null,
    evidence_date: '',
    valid_until: '',
    file_reference: '',
    new_proficiency: null as number | null,
    mark_completed: true
  };

  err(field: string): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  submit(): void {
    this.formError.set(null);
    const f = this.f;
    const errors: Record<string, string> = {};
    const hasScore = f.score !== null && f.score !== undefined;
    const hasMax = f.maximum_score !== null && f.maximum_score !== undefined;
    if (!f.evidence_title.trim()) errors['evidence_title'] = 'Title is required.';
    if (hasScore && !hasMax) errors['maximum_score'] = 'Enter the maximum score too.';
    if (hasScore && hasMax && f.score! > f.maximum_score!) errors['score'] = 'The score cannot be higher than the maximum.';
    if (f.evidence_date && f.evidence_date > this.today) errors['evidence_date'] = 'The date cannot be in the future.';
    if (f.valid_until && f.evidence_date && f.valid_until < f.evidence_date) errors['valid_until'] = 'Valid until cannot be before the evidence date.';
    this.fieldErrors.set(errors);
    if (Object.keys(errors).length) return;

    const body: EvidenceRequest = {
      evidence_type: f.evidence_type,
      evidence_title: f.evidence_title.trim(),
      evidence_description: f.evidence_description.trim() || null,
      score: hasScore ? f.score : null,
      maximum_score: hasMax ? f.maximum_score : null,
      evidence_date: f.evidence_date || null,
      valid_until: f.valid_until || null,
      file_reference: f.file_reference.trim() || null,
      new_proficiency: f.new_proficiency,
      mark_completed: f.mark_completed
    };

    this.saving.set(true);
    this.learning.recordEvidence(this.recommendationId(), body).subscribe({
      next: res => {
        this.saving.set(false);
        this.saved.emit(res);
      },
      error: err => {
        this.saving.set(false);
        const apiErrors = err instanceof HttpErrorResponse && typeof err.error === 'object' && err.error
          ? (err.error as { errors?: Record<string, string> }).errors : undefined;
        if (err instanceof HttpErrorResponse && err.status === 403) {
          this.formError.set('You do not have permission to record evidence.');
        } else if (apiErrors && Object.keys(apiErrors).length) {
          this.fieldErrors.set(apiErrors);
          this.formError.set('Please fix the highlighted fields.');
        } else {
          this.formError.set(toApiError(err).title);
        }
      }
    });
  }
}
