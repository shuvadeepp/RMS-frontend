import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, toApiError } from '../../core/error-message';
import { ToastService } from '../../core/toast.service';
import { SkillListItem, SkillRequest } from '../../models/skill.model';
import { AuthService } from '../../services/auth.service';
import { SkillService } from '../../services/skill.service';
import { ErrorBoxComponent } from '../../shared/error-box.component';
import { IconComponent } from '../../shared/icon.component';

const MAX_LEN = 100;
const CATEGORIES = ['Backend', 'Database', 'Frontend', 'Data', 'DevOps', 'Testing', 'Design'];

// Skills master list. Everyone can read; ADMIN and LK_ADMIN can add, edit and delete.
@Component({
  selector: 'app-skills',
  imports: [FormsModule, ErrorBoxComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="row head">
        <div class="spacer">
          <p class="eyebrow">Master data</p>
          <h1 class="page-title">Skills</h1>
          <p class="page-sub">The skills used for employee profiles, project requirements and learning resources.</p>
        </div>
        @if (canManage()) {
          <button type="button" class="btn btn-primary" (click)="openCreate()"><app-icon name="plus" [size]="16" /> Add skill</button>
        }
      </header>

      @if (formOpen()) {
        <form class="card editor" (ngSubmit)="submit()" aria-label="Skill form">
          <h2 class="section-title">{{ editingId() ? 'Edit skill' : 'Add skill' }}</h2>
          @if (formError()) { <p class="state state-error" role="alert">{{ formError() }}</p> }
          @if (loadingForm()) {
            <p class="state" role="status"><span class="spinner"></span> Loading...</p>
          } @else {
            <div class="grid grid-2">
              <div class="field">
                <label for="sk-name">Skill name <span class="req">(required)</span></label>
                <input id="sk-name" name="skill_name" class="input" maxlength="100" [(ngModel)]="form.skill_name" />
                @if (err('skill_name'); as e) { <span class="field-error">{{ e }}</span> }
              </div>
              <div class="field">
                <label for="sk-cat">Category</label>
                <select id="sk-cat" name="skill_category" class="select" [(ngModel)]="form.skill_category">
                  <option value="">No category</option>
                  @for (c of categoryOptions(); track c) { <option [value]="c">{{ c }}</option> }
                </select>
                @if (err('skill_category'); as e) { <span class="field-error">{{ e }}</span> }
              </div>
            </div>
            <div class="row">
              <button type="submit" class="btn btn-primary btn-sm" [disabled]="saving()">
                @if (saving()) { <span class="spinner"></span> } Save
              </button>
              <button type="button" class="btn btn-ghost btn-sm" (click)="closeForm()">Cancel</button>
            </div>
          }
        </form>
      }

      <div class="card filters">
        <div class="field">
          <label for="sk-q">Search skills</label>
          <input id="sk-q" name="q" class="input" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        </div>
      </div>

      @if (loading()) {
        <div class="card state" role="status"><span class="spinner"></span> Loading...</div>
      } @else if (error()) {
        <app-error-box [error]="error()!" (retry)="load()" />
      } @else if (filtered().length === 0) {
        <div class="card state">No skills found.</div>
      } @else {
        <div class="card table-wrap">
          <table class="table">
            <thead>
              <tr><th>ID</th><th>Skill</th><th>Category</th>@if (canManage()) { <th>Actions</th> }</tr>
            </thead>
            <tbody>
              @for (s of filtered(); track s.skill_id) {
                <tr>
                  <td>{{ s.skill_id }}</td>
                  <td>{{ s.skill_name }}</td>
                  <td>{{ s.skill_category || '-' }}</td>
                  @if (canManage()) {
                    <td>
                      @if (confirming()?.skill_id === s.skill_id) {
                        <div class="actions" role="alertdialog" [attr.aria-label]="'Confirm delete ' + s.skill_name">
                          <span class="confirm-text">Delete "{{ s.skill_name }}"?</span>
                          <button type="button" class="btn btn-sm btn-primary" [disabled]="busyId() === s.skill_id" (click)="confirmDelete()">
                            @if (busyId() === s.skill_id) { <span class="spinner"></span> } Yes, delete
                          </button>
                          <button type="button" class="btn btn-ghost btn-sm" [disabled]="busyId() === s.skill_id" (click)="cancelDelete()">Cancel</button>
                        </div>
                        @if (deleteError()) { <p class="field-error" role="alert">{{ deleteError() }}</p> }
                      } @else {
                        <div class="actions">
                          <button type="button" class="btn btn-sm" [disabled]="busyId() === s.skill_id" (click)="openEdit(s)">Edit</button>
                          <button type="button" class="btn btn-sm" [disabled]="busyId() === s.skill_id" (click)="askDelete(s)">Delete</button>
                        </div>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: `
    .head { align-items: flex-end; }
    .confirm-text { align-self: center; font-weight: 600; }
    .filters, .editor { display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px; }
    .table-wrap { overflow-x: auto; }
    .table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .table th { text-align: left; font-size: 12px; color: var(--muted); padding: 8px 10px; white-space: nowrap; }
    .table td { padding: 10px; border-top: 1px solid var(--border); vertical-align: top; }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .field-error { color: var(--danger-text); font-size: 12px; font-weight: 600; }
  `
})
export class SkillsComponent {
  private api = inject(SkillService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  readonly canManage = computed(() => this.auth.hasAnyRole('ADMIN', 'LK_ADMIN'));

  readonly skills = signal<SkillListItem[]>([]);
  readonly q = signal('');
  readonly filtered = computed(() => {
    const term = this.q().trim().toLowerCase();
    return term
      ? this.skills().filter(s => s.skill_name.toLowerCase().includes(term) || (s.skill_category ?? '').toLowerCase().includes(term))
      : this.skills();
  });
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly busyId = signal<number | null>(null);

  readonly formOpen = signal(false);
  readonly loadingForm = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  form = { skill_name: '', skill_category: '' };

  readonly confirming = signal<SkillListItem | null>(null);
  readonly deleteError = signal<string | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.list().subscribe({
      next: list => { this.skills.set(list ?? []); this.loading.set(false); },
      error: err => { this.error.set(toApiError(err)); this.loading.set(false); }
    });
  }

  // The fixed list, plus the skill's current category if it is not in the list (so editing never loses it).
  categoryOptions(): string[] {
    const current = this.form.skill_category;
    return current && !CATEGORIES.includes(current) ? [...CATEGORIES, current] : CATEGORIES;
  }

  err(field: string): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  openCreate(): void {
    this.form = { skill_name: '', skill_category: '' };
    this.editingId.set(null);
    this.resetErrors();
    this.loadingForm.set(false);
    this.formOpen.set(true);
  }

  // The list has no category, so load the full skill first.
  openEdit(s: SkillListItem): void {
    this.form = { skill_name: s.skill_name, skill_category: '' };
    this.editingId.set(s.skill_id);
    this.resetErrors();
    this.loadingForm.set(true);
    this.formOpen.set(true);
    this.api.get(s.skill_id).subscribe({
      next: skill => {
        // Ignore a late response if the user opened another skill meanwhile.
        if (this.editingId() !== s.skill_id) return;
        this.form = { skill_name: skill.skill_name, skill_category: skill.skill_category ?? '' };
        this.loadingForm.set(false);
      },
      error: err => {
        if (this.editingId() !== s.skill_id) return;
        this.loadingForm.set(false);
        this.closeForm();
        this.toast.error(`Could not load the skill: ${toApiError(err).title}`);
      }
    });
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
  }

  submit(): void {
    this.resetErrors();
    const name = this.form.skill_name.trim();
    const category = this.form.skill_category.trim();
    const errors: Record<string, string> = {};
    if (!name) errors['skill_name'] = 'Skill name is required.';
    else if (name.length > MAX_LEN) errors['skill_name'] = `Skill name must be at most ${MAX_LEN} characters.`;
    if (category.length > MAX_LEN) errors['skill_category'] = `Category must be at most ${MAX_LEN} characters.`;
    if (Object.keys(errors).length) {
      this.fieldErrors.set(errors);
      return;
    }

    const body: SkillRequest = { skill_name: name, skill_category: category || null };
    const id = this.editingId();
    this.saving.set(true);
    (id ? this.api.update(id, body) : this.api.create(body)).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeForm();
        this.toast.success(id ? 'Skill saved.' : 'Skill added.');
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.showSaveError(err);
      }
    });
  }

  askDelete(s: SkillListItem): void {
    this.deleteError.set(null);
    this.confirming.set(s);
  }

  cancelDelete(): void {
    this.confirming.set(null);
    this.deleteError.set(null);
  }

  confirmDelete(): void {
    const s = this.confirming();
    if (!s) return;
    this.busyId.set(s.skill_id);
    this.deleteError.set(null);
    this.api.delete(s.skill_id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.confirming.set(null);
        this.skills.update(list => list.filter(x => x.skill_id !== s.skill_id));
        this.toast.success('Skill deleted.');
      },
      error: err => {
        this.busyId.set(null);
        const e = toApiError(err);
        // 409: the skill is still used by employees, requirements or learning resources.
        const msg = e.status === 403 ? 'You do not have permission to do this.' : e.title;
        this.deleteError.set(msg);
        this.toast.error(msg);
      }
    });
  }

  private resetErrors(): void {
    this.fieldErrors.set({});
    this.formError.set(null);
  }

  // 400: show errors[field] under each input. Everything else: show the message.
  private showSaveError(err: unknown): void {
    const body = err instanceof HttpErrorResponse && typeof err.error === 'object' && err.error
      ? err.error as { errors?: Record<string, string> } : null;
    if (body?.errors && Object.keys(body.errors).length) {
      this.fieldErrors.set(body.errors);
      this.formError.set('Please fix the highlighted fields.');
    } else if (err instanceof HttpErrorResponse && err.status === 403) {
      this.formError.set('You do not have permission to do this.');
    } else {
      this.formError.set(toApiError(err).title);
    }
  }
}
