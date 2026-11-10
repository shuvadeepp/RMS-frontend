import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, toApiError } from '../../core/error-message';
import { ToastService } from '../../core/toast.service';
import { PersonTag, ReleaseRequest, TagCode, TaggedPerson } from '../../models/tagged-people.model';
import { AuthService } from '../../services/auth.service';
import { MatchStateService } from '../../services/match-state.service';
import { TaggedPeopleService } from '../../services/tagged-people.service';
import { ErrorBoxComponent } from '../../shared/error-box.component';
import { IconComponent } from '../../shared/icon.component';
import { formatDayMonYear, humanise, statusPill, tagInfo } from '../../shared/labels';
import { TagBadgeComponent } from '../../shared/tag-badge.component';

type TagFilter = 'ALL' | TagCode;

// One table row / card: a tag plus its employee. "span" is set on the first row of each employee group.
interface TagRow {
  key: string;
  person: TaggedPerson;
  tag: PersonTag;
  span: number;
}

const MIN_REASON = 5;
const FALLBACK_ERROR = 'Something went wrong, please try again';

// Release errors (400/403/404/409) carry a "message" to show as-is.
function releaseErrorOf(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return toApiError(err).title;
    const message = (err.error as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return FALLBACK_ERROR;
}

@Component({
  selector: 'app-tagged-people',
  imports: [FormsModule, IconComponent, ErrorBoxComponent, TagBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tagged-people.component.html',
  styleUrl: './tagged-people.component.scss'
})
export class TaggedPeopleComponent implements OnInit {
  private api = inject(TaggedPeopleService);
  private toast = inject(ToastService);
  private matchState = inject(MatchStateService);
  readonly isAdmin = inject(AuthService).isAdmin;

  readonly people = signal<TaggedPerson[] | null>(null);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly search = signal('');
  readonly tagFilter = signal<TagFilter>('ALL');
  readonly tagOptions: Array<{ value: TagFilter; label: string }> = [
    { value: 'ALL', label: 'All' },
    { value: 'FULLY_ALLOCATED', label: 'Fully allocated' },
    { value: 'PARTIALLY_ALLOCATED', label: 'Partially allocated' }
  ];

  readonly totalTags = computed(() => (this.people() ?? []).reduce((sum, p) => sum + (p.tags?.length ?? 0), 0));
  readonly filtering = computed(() => this.search().trim() !== '' || this.tagFilter() !== 'ALL');

  readonly rows = computed<TagRow[]>(() => {
    const term = this.search().trim().toLowerCase();
    const type = this.tagFilter();
    const rows: TagRow[] = [];
    for (const person of this.people() ?? []) {
      const text = `${person.resource_name ?? ''} ${person.employee_code ?? ''}`.toLowerCase();
      if (term && !text.includes(term)) continue;
      const tags = (person.tags ?? []).filter(t => type === 'ALL' || (t.tag ?? '').toUpperCase() === type);
      tags.forEach((tag, i) => rows.push({
        key: `${person.employee_id}-${tag.tag}-${tag.allocation_id ?? tag.requirement_id ?? ''}-${i}`,
        person,
        tag,
        span: i === 0 ? tags.length : 0
      }));
    }
    return rows;
  });
  readonly visiblePeople = computed(() => this.rows().filter(r => r.span > 0).length);

  // Release dialog.
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('releaseDialog');
  readonly target = signal<TagRow | null>(null);
  readonly reason = signal('');
  readonly reasonTouched = signal(false);
  readonly releasing = signal(false);
  readonly releaseError = signal<string | null>(null);
  readonly reasonValid = computed(() => this.reason().trim().length >= MIN_REASON);
  readonly minReason = MIN_REASON;

  readonly tagInfo = tagInfo;
  readonly statusPill = statusPill;
  readonly humanise = humanise;
  readonly formatDayMonYear = formatDayMonYear;

  ngOnInit(): void {
    this.load();
  }

  // Keeps the current list on screen while refreshing; the first load shows the spinner.
  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.api.getTaggedPeople().subscribe({
      next: list => {
        this.people.set(list);
        this.loading.set(false);
      },
      error: err => {
        this.error.set({ ...toApiError(err), retryable: true });
        this.loading.set(false);
      }
    });
  }

  clearFilters(): void {
    this.search.set('');
    this.tagFilter.set('ALL');
  }

  // Every tag here is an allocation; only those carry an allocation_id to release.
  canRelease(tag: PersonTag): boolean {
    return tag.allocation_id !== null && tag.allocation_id !== undefined;
  }

  projectOf(tag: PersonTag): string {
    return tag.project_name || tag.requirement_code || 'this requirement';
  }

  requirementLine(tag: PersonTag): string {
    return [tag.requirement_code, tag.role_name].filter(Boolean).join(' - ');
  }

  percentOf(tag: PersonTag): string {
    return tag.allocation_percentage === null || tag.allocation_percentage === undefined ? '-' : `${tag.allocation_percentage}%`;
  }

  openRelease(row: TagRow): void {
    if (!this.isAdmin() || !this.canRelease(row.tag)) return;
    this.target.set(row);
    this.reason.set('');
    this.reasonTouched.set(false);
    this.releaseError.set(null);
    this.dialog()?.nativeElement.showModal();
  }

  closeRelease(): void {
    if (this.releasing()) return;
    this.dialog()?.nativeElement.close();
  }

  // Esc while the request runs would leave it without a dialog to report into.
  onDialogCancel(event: Event): void {
    if (this.releasing()) event.preventDefault();
  }

  onDialogClosed(): void {
    this.target.set(null);
  }

  confirmRelease(): void {
    const row = this.target();
    if (!row || this.releasing()) return;
    this.reasonTouched.set(true);
    if (!this.reasonValid()) return;

    if (!this.canRelease(row.tag)) {
      this.releaseError.set('This tag has no allocation to release.');
      return;
    }
    const request: ReleaseRequest = { allocation_id: row.tag.allocation_id!, reason: this.reason().trim() };

    this.releasing.set(true);
    this.releaseError.set(null);
    this.api.release(request).subscribe({
      next: res => {
        this.releasing.set(false);
        this.dialog()?.nativeElement.close();
        this.toast.success(res?.message || `${row.person.resource_name ?? 'Employee'} released.`);
        this.load();
        this.matchState.refreshMatches();
      },
      error: err => {
        this.releasing.set(false);
        this.releaseError.set(releaseErrorOf(err));
      }
    });
  }
}
