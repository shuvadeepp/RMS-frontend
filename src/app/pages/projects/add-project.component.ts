import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { getErrorMessage } from '../../core/error-message';
import { ToastService } from '../../core/toast.service';
import { LookupService } from '../../services/lookup.service';
import { DatePickerComponent } from '../../shared/date-picker.component';
import { IconComponent } from '../../shared/icon.component';
import { humanise } from '../../shared/labels';

type Field = 'code' | 'name' | 'dates';

@Component({
  selector: 'app-add-project',
  imports: [FormsModule, RouterLink, IconComponent, DatePickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="row">
        <div class="spacer">
          <p class="eyebrow">Projects</p>
          <h1 class="page-title">Add a project</h1>
        </div>
        <a class="btn" routerLink="/projects"><app-icon name="arrow-left" [size]="18" /> Back to projects</a>
      </header>

      <form class="card form" (ngSubmit)="submit()" novalidate>
        <div class="grid">
          <div class="field">
            <label for="code">Project code <span class="req" aria-hidden="true">*</span></label>
            <input id="code" name="code" class="input" maxlength="50" autocomplete="off" required
                   [class.invalid]="msg('code')" [attr.aria-invalid]="msg('code') ? true : null"
                   [ngModel]="code()" (ngModelChange)="code.set($event)" />
            @if (msg('code')) { <p class="field-error">{{ msg('code') }}</p> }
          </div>
          <div class="field">
            <label for="name">Project name <span class="req" aria-hidden="true">*</span></label>
            <input id="name" name="name" class="input" maxlength="255" autocomplete="off" required
                   [class.invalid]="msg('name')" [attr.aria-invalid]="msg('name') ? true : null"
                   [ngModel]="name()" (ngModelChange)="name.set($event)" />
            @if (msg('name')) { <p class="field-error">{{ msg('name') }}</p> }
          </div>
          <div class="field">
            <label for="domain">Domain</label>
            <select id="domain" name="domain" class="select" [ngModel]="domain()" (ngModelChange)="domain.set($event)">
              <option value="">Select a skill</option>
              @for (s of skills(); track s.skillName) { <option [value]="s.skillName">{{ s.skillName }}</option> }
            </select>
          </div>
          <div class="field">
            <label for="status">Status</label>
            <select id="status" name="status" class="select" [ngModel]="status()" (ngModelChange)="status.set($event)">
              @for (s of statuses; track s) { <option [value]="s">{{ humanise(s) }}</option> }
            </select>
          </div>
          <div class="field">
            <label for="start">Start date</label>
            <app-date-picker inputId="start" name="start" placeholder="Select start date"
                             [invalid]="!!msg('dates')" [ngModel]="startDate()" (ngModelChange)="startDate.set($event ?? '')" />
          </div>
          <div class="field">
            <label for="end">End date</label>
            <app-date-picker inputId="end" name="end" placeholder="Select end date"
                             [invalid]="!!msg('dates')" [ngModel]="endDate()" (ngModelChange)="endDate.set($event ?? '')" />
            @if (msg('dates')) { <p class="field-error">{{ msg('dates') }}</p> }
          </div>
        </div>

        <div class="field">
          <label for="desc">Description</label>
          <textarea id="desc" name="desc" class="textarea" rows="4" placeholder="What is this project about?"
                    [ngModel]="description()" (ngModelChange)="description.set($event)"></textarea>
        </div>

        @if (serverError()) { <p class="field-error" role="alert">{{ serverError() }}</p> }

        <div class="actions">
          <a class="btn" routerLink="/projects">Cancel</a>
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving...' : 'Save project' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .form { display: flex; flex-direction: column; gap: 18px; max-width: 860px; }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .actions { display: flex; justify-content: flex-end; gap: 10px; }
  `
})
export class AddProjectComponent {
  private lookups = inject(LookupService);
  private router = inject(Router);
  private toast = inject(ToastService);

  readonly skills = toSignal(this.lookups.getSkills(), { initialValue: [] });
  readonly statuses = ['DRAFT', 'PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
  readonly humanise = humanise;

  readonly code = signal('');
  readonly name = signal('');
  readonly domain = signal('');
  readonly status = signal('DRAFT');
  readonly startDate = signal('');
  readonly endDate = signal('');
  readonly description = signal('');

  readonly touched = signal(false);
  readonly saving = signal(false);
  readonly serverError = signal<string | null>(null);

  msg(field: Field): string | null {
    if (!this.touched()) return null;
    switch (field) {
      case 'code': return this.code().trim() ? null : 'Project code is required.';
      case 'name': return this.name().trim() ? null : 'Project name is required.';
      case 'dates':
        return this.startDate() && this.endDate() && this.endDate() < this.startDate()
          ? 'End date cannot be before the start date.' : null;
    }
  }

  submit(): void {
    this.touched.set(true);
    this.serverError.set(null);
    if (this.saving() || this.msg('code') || this.msg('name') || this.msg('dates')) {
      return;
    }
    this.saving.set(true);
    this.lookups.createProject({
      projectCode: this.code().trim(),
      projectName: this.name().trim(),
      projectDomain: this.domain().trim() || null,
      projectDescription: this.description().trim() || null,
      projectStatus: this.status(),
      startDate: this.startDate() || null,
      endDate: this.endDate() || null
    }).subscribe({
      next: p => {
        this.toast.success(`Project ${p.projectCode} added.`);
        this.router.navigate(['/projects']);
      },
      error: err => {
        this.serverError.set(getErrorMessage(err));
        this.saving.set(false);
      }
    });
  }
}
