import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, catchError, of } from 'rxjs';
import { ApiError, toApiError } from '../../core/error-message';
import { Employee } from '../../models/employee.model';
import { EmployeeService } from '../../services/employee.service';
import { LookupService } from '../../services/lookup.service';
import { ErrorBoxComponent } from '../../shared/error-box.component';
import { IconComponent } from '../../shared/icon.component';
import { EmployeeCardComponent } from '../../shared/employee-card.component';
import { fromEmployee } from '../../shared/employee-view';

@Component({
  selector: 'app-people',
  imports: [FormsModule, IconComponent, ErrorBoxComponent, EmployeeCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header>
        <p class="eyebrow">People & skills</p>
        <h1 class="page-title">Who knows what</h1>
        <p class="page-sub">Search by role, department, experience and skills. This search does not use the AI.</p>
      </header>

      <form class="card search" (ngSubmit)="search()" aria-label="Search people">
        <div class="grid grid-3">
          <div class="field">
            <label for="designation">Designation</label>
            <select id="designation" name="designation" class="select" [ngModel]="designation()" (ngModelChange)="designation.set($event)">
              <option value="">Any</option>
              @for (d of designations(); track d.designationName) { <option [value]="d.designationName">{{ d.designationName }}</option> }
            </select>
          </div>
          <div class="field">
            <label for="department">Department</label>
            <select id="department" name="department" class="select" [ngModel]="department()" (ngModelChange)="department.set($event)">
              <option value="">Any</option>
              @for (d of departments(); track d.departmentName) { <option [value]="d.departmentName">{{ d.departmentName }}</option> }
            </select>
          </div>
          <div class="field">
            <label for="min-exp">Minimum experience</label>
            <select id="min-exp" name="minExp" class="select" [ngModel]="minExperience()" (ngModelChange)="minExperience.set($event)">
              <option [ngValue]="null">Any</option>
              @for (y of [1, 2, 3, 5, 8]; track y) { <option [ngValue]="y">{{ y }}+ years</option> }
            </select>
          </div>
        </div>
        <div class="field">
          <label for="skill-add">Skills</label>
          <div class="row">
            <select id="skill-add" name="skillAdd" class="select skill-select" #skillSel (change)="addSkill(skillSel.value); skillSel.value = ''">
              <option value="">Add a skill</option>
              @for (s of skillChoices(); track s.skillName) { <option [value]="s.skillName">{{ s.skillName }}</option> }
            </select>
            @for (s of skills(); track s) {
              <span class="chip">{{ s }}
                <button type="button" class="chip-x" (click)="removeSkill(s)">
                  <app-icon name="x" [size]="14" /><span class="sr-only">Remove {{ s }}</span>
                </button>
              </span>
            }
          </div>
        </div>
        <div class="row">
          <button type="submit" class="btn btn-primary"><app-icon name="search" [size]="18" /> Search</button>
          <button type="button" class="btn btn-ghost" (click)="reset()">Clear</button>
        </div>
      </form>

      @if (loading()) {
        <div class="card state" role="status"><span class="spinner"></span> Loading people...</div>
      } @else if (error()) {
        <app-error-box [error]="error()!" (retry)="run(lastQuery)" />
      } @else {
        <p class="muted small" role="status">{{ people().length }} {{ people().length === 1 ? 'person' : 'people' }}{{ filtered() ? ' match your search' : ' in the system' }}</p>
        @if (people().length === 0) {
          <div class="card state">Nobody matches these filters. Try fewer skills or a lower experience.</div>
        }
        <div class="emp-grid">
          @for (e of views(); track e.code) { <app-employee-card [employee]="e" /> }
        </div>
      }
    </div>
  `,
  styles: `
    .search { display: flex; flex-direction: column; gap: 16px; }
    .skill-select { max-width: 260px; }
    .chip-x { background: none; border: 0; padding: 2px; cursor: pointer; color: var(--muted); display: inline-flex; border-radius: 50%; }
    .emp-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  `
})
export class PeopleComponent implements OnInit {
  private employeesApi = inject(EmployeeService);
  private lookups = inject(LookupService);

  readonly designations = toSignal(this.lookups.getDesignations().pipe(catchError(() => of([]))), { initialValue: [] });
  readonly departments = toSignal(this.lookups.getDepartments().pipe(catchError(() => of([]))), { initialValue: [] });
  readonly skillOptions = toSignal(this.lookups.getSkills().pipe(catchError(() => of([]))), { initialValue: [] });

  readonly designation = signal('');
  readonly department = signal('');
  readonly minExperience = signal<number | null>(null);
  readonly skills = signal<string[]>([]);

  readonly people = signal<Employee[]>([]);
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);
  readonly filtered = signal(false);
  lastQuery: 'all' | 'search' = 'all';

  readonly skillChoices = computed(() => this.skillOptions().filter(s => !this.skills().includes(s.skillName)));
  readonly views = computed(() => this.people().map(fromEmployee));

  ngOnInit(): void {
    this.run('all');
  }

  addSkill(name: string): void {
    if (name && !this.skills().includes(name)) this.skills.update(list => [...list, name]);
  }

  removeSkill(name: string): void {
    this.skills.update(list => list.filter(s => s !== name));
  }

  search(): void {
    const any = this.designation() || this.department() || this.minExperience() !== null || this.skills().length > 0;
    this.run(any ? 'search' : 'all');
  }

  reset(): void {
    this.designation.set('');
    this.department.set('');
    this.minExperience.set(null);
    this.skills.set([]);
    this.run('all');
  }

  run(kind: 'all' | 'search'): void {
    this.lastQuery = kind;
    this.loading.set(true);
    this.error.set(null);
    const source: Observable<Employee[]> = kind === 'all'
      ? this.employeesApi.getAllEmployees()
      : this.employeesApi.searchEmployees({
          designation: this.designation(),
          department: this.department(),
          minExperience: this.minExperience(),
          skills: this.skills()
        });
    source.subscribe({
      next: list => {
        this.people.set(list);
        this.filtered.set(kind === 'search');
        this.loading.set(false);
      },
      error: err => {
        this.error.set(toApiError(err));
        this.loading.set(false);
      }
    });
  }
}
