import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { ApiError, toApiError } from '../../core/error-message';
import { ToastService } from '../../core/toast.service';
import { SkillWithId } from '../../models/employee.model';
import { LearningResource, LearningResourceRequest } from '../../models/learning-catalog.model';
import { ResourceType, ValidationMethod } from '../../models/requirement.model';
import { AuthService } from '../../services/auth.service';
import { LearningCatalogService } from '../../services/learning-catalog.service';
import { LookupService } from '../../services/lookup.service';
import { ErrorBoxComponent } from '../../shared/error-box.component';
import { IconComponent } from '../../shared/icon.component';
import { humanise } from '../../shared/labels';

const RESOURCE_TYPES: ResourceType[] = ['COURSE', 'CERTIFICATION', 'DOCUMENTATION', 'MENTORING', 'PRACTICAL_ASSIGNMENT', 'ASSESSMENT', 'OTHER'];
const VALIDATION_METHODS: ValidationMethod[] = ['KNOWLEDGE_ASSESSMENT', 'PRACTICAL_ASSIGNMENT', 'DEMONSTRATION', 'TECHNICAL_REVIEW', 'CERTIFICATE', 'NONE'];

interface ResourceForm {
  skill_id: number | null;
  resource_title: string;
  resource_type: ResourceType;
  provider: string;
  resource_url: string;
  resource_description: string;
  from_proficiency: number;
  to_proficiency: number | null;
  estimated_hours: number | null;
  validation_method: ValidationMethod;
  is_active: boolean;
}

function emptyForm(): ResourceForm {
  return {
    skill_id: null, resource_title: '', resource_type: 'COURSE', provider: '', resource_url: '', resource_description: '',
    from_proficiency: 1, to_proficiency: null, estimated_hours: null, validation_method: 'KNOWLEDGE_ASSESSMENT', is_active: true
  };
}

type Tri = '' | 'true' | 'false';

// L&K catalog: everyone with access can read it; ADMIN and LK_ADMIN can add, edit, approve and deactivate.
@Component({
  selector: 'app-learning-catalog',
  imports: [FormsModule, ErrorBoxComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="row head">
        <div class="spacer">
          <p class="eyebrow">Learning &amp; Knowledge</p>
          <h1 class="page-title">Learning catalog</h1>
          <p class="page-sub">Approved learning resources are used first when a learning plan is made for a skill gap.</p>
        </div>
        @if (canManage()) {
          <button type="button" class="btn btn-primary" (click)="openCreate()"><app-icon name="plus" [size]="16" /> Add resource</button>
        }
      </header>

      <form class="card filters" (ngSubmit)="load()" aria-label="Filter resources">
        <div class="grid grid-4">
          <div class="field">
            <label for="lc-skill">Skill</label>
            <select id="lc-skill" name="skill" class="select" [ngModel]="skillId()" (ngModelChange)="skillId.set($event); load()">
              <option [ngValue]="null">All skills</option>
              @for (s of skills(); track s.skill_id) { <option [ngValue]="s.skill_id">{{ s.skill_name }}</option> }
            </select>
            @if (skillsError(); as se) { <span class="field-error">{{ se }}</span> }
          </div>
          <div class="field">
            <label for="lc-appr">Approval</label>
            <select id="lc-appr" name="approved" class="select" [ngModel]="approved()" (ngModelChange)="approved.set($event); load()">
              <option value="">All</option><option value="true">Approved</option><option value="false">Awaiting approval</option>
            </select>
          </div>
          <div class="field">
            <label for="lc-act">Active</label>
            <select id="lc-act" name="active" class="select" [ngModel]="active()" (ngModelChange)="active.set($event); load()">
              <option value="">All</option><option value="true">Active</option><option value="false">Inactive</option>
            </select>
          </div>
          <div class="field">
            <label for="lc-q">Search title or provider</label>
            <input id="lc-q" name="q" class="input" [ngModel]="q()" (ngModelChange)="q.set($event)" />
          </div>
        </div>
        <div class="row"><button type="submit" class="btn btn-sm">Search</button></div>
      </form>

      @if (formOpen()) {
        <form class="card editor" (ngSubmit)="submit()" aria-label="Learning resource form">
          <h2 class="section-title">{{ editingId() ? 'Edit resource' : 'Add resource' }}</h2>
          @if (formError()) { <p class="state state-error" role="alert">{{ formError() }}</p> }
          <div class="grid grid-3">
            <div class="field">
              <label for="f-skill">Skill <span class="req">(required)</span></label>
              <select id="f-skill" name="skill_id" class="select" [(ngModel)]="form.skill_id">
                <option [ngValue]="null">Choose a skill</option>
                @for (s of skills(); track s.skill_id) { <option [ngValue]="s.skill_id">{{ s.skill_name }}</option> }
              </select>
              @if (err('skill_id'); as e) { <span class="field-error">{{ e }}</span> }
            </div>
            <div class="field">
              <label for="f-title">Title <span class="req">(required)</span></label>
              <input id="f-title" name="resource_title" class="input" [(ngModel)]="form.resource_title" />
              @if (err('resource_title'); as e) { <span class="field-error">{{ e }}</span> }
            </div>
            <div class="field">
              <label for="f-type">Type</label>
              <select id="f-type" name="resource_type" class="select" [(ngModel)]="form.resource_type">
                @for (t of types; track t) { <option [ngValue]="t">{{ humanise(t) }}</option> }
              </select>
              @if (err('resource_type'); as e) { <span class="field-error">{{ e }}</span> }
            </div>
            <div class="field">
              <label for="f-prov">Provider</label>
              <input id="f-prov" name="provider" class="input" [(ngModel)]="form.provider" />
            </div>
            <div class="field">
              <label for="f-url">URL</label>
              <input id="f-url" name="resource_url" class="input" [(ngModel)]="form.resource_url" />
              @if (err('resource_url'); as e) { <span class="field-error">{{ e }}</span> }
            </div>
            <div class="field">
              <label for="f-val">Validation method</label>
              <select id="f-val" name="validation_method" class="select" [(ngModel)]="form.validation_method">
                @for (v of methods; track v) { <option [ngValue]="v">{{ humanise(v) }}</option> }
              </select>
              @if (err('validation_method'); as e) { <span class="field-error">{{ e }}</span> }
            </div>
            <div class="field">
              <label for="f-from">From level (1-5)</label>
              <select id="f-from" name="from_proficiency" class="select" [(ngModel)]="form.from_proficiency">
                @for (n of levels; track n) { <option [ngValue]="n">{{ n }}</option> }
              </select>
              @if (err('from_proficiency'); as e) { <span class="field-error">{{ e }}</span> }
            </div>
            <div class="field">
              <label for="f-to">To level (1-5) <span class="req">(required)</span></label>
              <select id="f-to" name="to_proficiency" class="select" [(ngModel)]="form.to_proficiency">
                <option [ngValue]="null">Choose</option>
                @for (n of levels; track n) { <option [ngValue]="n">{{ n }}</option> }
              </select>
              @if (err('to_proficiency'); as e) { <span class="field-error">{{ e }}</span> }
            </div>
            <div class="field">
              <label for="f-hours">Estimated hours</label>
              <input id="f-hours" name="estimated_hours" type="number" min="0" step="0.5" class="input" [(ngModel)]="form.estimated_hours" />
              @if (err('estimated_hours'); as e) { <span class="field-error">{{ e }}</span> }
            </div>
          </div>
          <div class="field">
            <label for="f-desc">Description</label>
            <textarea id="f-desc" name="resource_description" class="textarea" rows="2" [(ngModel)]="form.resource_description"></textarea>
          </div>
          <label class="check"><input type="checkbox" name="is_active" [(ngModel)]="form.is_active" /> Active</label>
          <div class="row">
            <button type="submit" class="btn btn-primary btn-sm" [disabled]="saving()">
              @if (saving()) { <span class="spinner"></span> } Save
            </button>
            <button type="button" class="btn btn-ghost btn-sm" (click)="closeForm()">Cancel</button>
          </div>
        </form>
      }

      @if (loading()) {
        <div class="card state" role="status"><span class="spinner"></span> Loading...</div>
      } @else if (error()) {
        <app-error-box [error]="error()!" (retry)="load()" />
      } @else if (resources().length === 0) {
        <div class="card state">No learning resources found.</div>
      } @else {
        <div class="card table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Skill</th><th>Title</th><th>Type</th><th>Provider</th><th>Levels</th><th>Effort</th><th>Validation</th><th>Status</th>
                @if (canManage()) { <th>Actions</th> }
              </tr>
            </thead>
            <tbody>
              @for (r of resources(); track r.learning_resource_id) {
                <tr>
                  <td>{{ r.skill_name }}</td>
                  <td>
                    @if (r.resource_url) { <a [href]="r.resource_url" target="_blank" rel="noopener">{{ r.resource_title }}</a> } @else { {{ r.resource_title }} }
                  </td>
                  <td>{{ humanise(r.resource_type) }}</td>
                  <td>{{ r.provider || '-' }}</td>
                  <td>{{ r.from_proficiency }} → {{ r.to_proficiency }}</td>
                  <td>@if (r.estimated_hours) { {{ r.estimated_hours }} h@if (r.estimated_weeks) { ({{ r.estimated_weeks }} wk) } } @else { - }</td>
                  <td>{{ humanise(r.validation_method) }}</td>
                  <td>
                    <div class="status-col">
                      @if (r.is_approved) { <span class="pill pill-success">Approved</span> } @else { <span class="pill pill-warning">Awaiting approval</span> }
                      @if (!r.is_active) { <span class="pill pill-neutral">Inactive</span> }
                    </div>
                  </td>
                  @if (canManage()) {
                    <td>
                      <div class="actions">
                        <button type="button" class="btn btn-sm" [disabled]="busyId() === r.learning_resource_id" (click)="openEdit(r)">Edit</button>
                        <button type="button" class="btn btn-sm" [disabled]="busyId() === r.learning_resource_id" (click)="toggleApproval(r)">
                          {{ r.is_approved ? 'Remove approval' : 'Approve' }}
                        </button>
                        <button type="button" class="btn btn-sm" [disabled]="busyId() === r.learning_resource_id" (click)="toggleActive(r)">
                          {{ r.is_active ? 'Deactivate' : 'Activate' }}
                        </button>
                      </div>
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
    .filters, .editor { display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px; }
    .table-wrap { overflow-x: auto; }
    .table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .table th { text-align: left; font-size: 12px; color: var(--muted); padding: 8px 10px; white-space: nowrap; }
    .table td { padding: 10px; border-top: 1px solid var(--border); vertical-align: top; }
    .status-col, .actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .field-error { color: var(--danger-text); font-size: 12px; font-weight: 600; }
    .check { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
  `
})
export class LearningCatalogComponent {
  private api = inject(LearningCatalogService);
  private lookups = inject(LookupService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  readonly types = RESOURCE_TYPES;
  readonly methods = VALIDATION_METHODS;
  readonly levels = [1, 2, 3, 4, 5];
  readonly humanise = humanise;

  readonly skillsError = signal<string | null>(null);
  readonly skills = toSignal(this.lookups.getSkillsWithIds().pipe(
    catchError(err => {
      const e = toApiError(err);
      console.error('Failed to load /api/skills/with-ids', err);
      this.skillsError.set(`Could not load skills (${e.status ?? 'network'}): ${e.title}`);
      return of<SkillWithId[]>([]);
    })
  ), { initialValue: [] as SkillWithId[] });

  readonly canManage = computed(() => ['ADMIN', 'LK_ADMIN'].includes(this.auth.role()));

  readonly skillId = signal<number | null>(null);
  readonly approved = signal<Tri>('');
  readonly active = signal<Tri>('');
  readonly q = signal('');

  readonly resources = signal<LearningResource[]>([]);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly busyId = signal<number | null>(null);

  readonly formOpen = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  form: ResourceForm = emptyForm();

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.list({
      skillId: this.skillId(),
      approved: this.approved() === '' ? null : this.approved() === 'true',
      active: this.active() === '' ? null : this.active() === 'true',
      q: this.q().trim()
    }).subscribe({
      next: list => { this.resources.set(list ?? []); this.loading.set(false); },
      error: err => { this.error.set(toApiError(err)); this.loading.set(false); }
    });
  }

  err(field: string): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  openCreate(): void {
    this.form = emptyForm();
    this.editingId.set(null);
    this.resetErrors();
    this.formOpen.set(true);
  }

  openEdit(r: LearningResource): void {
    this.form = {
      skill_id: r.skill_id, resource_title: r.resource_title, resource_type: r.resource_type, provider: r.provider ?? '',
      resource_url: r.resource_url ?? '', resource_description: r.resource_description ?? '',
      from_proficiency: r.from_proficiency, to_proficiency: r.to_proficiency, estimated_hours: r.estimated_hours,
      validation_method: r.validation_method, is_active: r.is_active
    };
    this.editingId.set(r.learning_resource_id);
    this.resetErrors();
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
  }

  submit(): void {
    this.resetErrors();
    const f = this.form;
    const errors: Record<string, string> = {};
    if (!f.skill_id) errors['skill_id'] = 'Choose a skill.';
    if (!f.resource_title.trim()) errors['resource_title'] = 'Title is required.';
    if (!f.to_proficiency) errors['to_proficiency'] = 'Choose the target level.';
    else if (f.from_proficiency >= f.to_proficiency) errors['to_proficiency'] = 'The target level must be higher than the starting level.';
    if (f.estimated_hours !== null && f.estimated_hours !== undefined && !(f.estimated_hours > 0)) errors['estimated_hours'] = 'Hours must be more than 0.';
    if (Object.keys(errors).length) {
      this.fieldErrors.set(errors);
      return;
    }

    const body = this.toRequest(f);
    const id = this.editingId();
    this.saving.set(true);
    (id ? this.api.update(id, body) : this.api.create(body)).subscribe({
      next: res => {
        this.saving.set(false);
        this.closeForm();
        if (id) {
          this.replace(res);
          this.toast.success('Resource saved.');
          if (res.note) this.toast.info(res.note);
        } else {
          this.toast.success('Created. It must be approved before it is used in recommendations.');
          this.load();
        }
      },
      error: err => {
        this.saving.set(false);
        this.showSaveError(err);
      }
    });
  }

  toggleApproval(r: LearningResource): void {
    this.busyId.set(r.learning_resource_id);
    this.api.setApproval(r.learning_resource_id, !r.is_approved).subscribe({
      next: res => {
        this.busyId.set(null);
        this.replace(res);
        this.toast.success(res.is_approved ? 'Resource approved.' : 'Approval removed.');
      },
      error: err => this.actionFailed(err, 'Approval not changed')
    });
  }

  // PUT is a full replace, so send the whole resource with the flag flipped.
  toggleActive(r: LearningResource): void {
    this.busyId.set(r.learning_resource_id);
    const body = this.toRequest({
      skill_id: r.skill_id, resource_title: r.resource_title, resource_type: r.resource_type, provider: r.provider ?? '',
      resource_url: r.resource_url ?? '', resource_description: r.resource_description ?? '',
      from_proficiency: r.from_proficiency, to_proficiency: r.to_proficiency, estimated_hours: r.estimated_hours,
      validation_method: r.validation_method, is_active: !r.is_active
    });
    this.api.update(r.learning_resource_id, body).subscribe({
      next: res => {
        this.busyId.set(null);
        this.replace(res);
        this.toast.success(res.is_active ? 'Resource activated.' : 'Resource deactivated.');
        if (res.note) this.toast.info(res.note);
      },
      error: err => this.actionFailed(err, 'Resource not changed')
    });
  }

  private toRequest(f: ResourceForm): LearningResourceRequest {
    return {
      skill_id: f.skill_id!,
      resource_title: f.resource_title.trim(),
      resource_type: f.resource_type,
      provider: f.provider.trim() || null,
      resource_url: f.resource_url.trim() || null,
      resource_description: f.resource_description.trim() || null,
      from_proficiency: f.from_proficiency,
      to_proficiency: f.to_proficiency!,
      estimated_hours: f.estimated_hours,
      validation_method: f.validation_method,
      is_active: f.is_active
    };
  }

  private replace(res: LearningResource): void {
    this.resources.update(list => list.map(x => x.learning_resource_id === res.learning_resource_id ? res : x));
  }

  private resetErrors(): void {
    this.fieldErrors.set({});
    this.formError.set(null);
  }

  // 400: show the backend "errors" map under the fields. 409 and others: show the message.
  private showSaveError(err: unknown): void {
    const body = err instanceof HttpErrorResponse && typeof err.error === 'object' && err.error ? err.error as { errors?: Record<string, string> } : null;
    if (err instanceof HttpErrorResponse && err.status === 403) {
      this.formError.set('Only L&K admins can change the catalog.');
    } else if (body?.errors && Object.keys(body.errors).length) {
      this.fieldErrors.set(body.errors);
      this.formError.set('Please fix the highlighted fields.');
    } else {
      this.formError.set(toApiError(err).title);
    }
  }

  private actionFailed(err: unknown, prefix: string): void {
    this.busyId.set(null);
    const e = toApiError(err);
    this.toast.error(e.status === 403 ? 'Only L&K admins can change the catalog.' : `${prefix}: ${e.title}`);
  }
}
