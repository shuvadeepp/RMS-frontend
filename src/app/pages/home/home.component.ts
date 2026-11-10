import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiError, toApiError } from '../../core/error-message';
import { DashboardSummary, Requirement } from '../../models/requirement.model';
import { AuthService } from '../../services/auth.service';
import { RequirementService, requirementStatusOf } from '../../services/requirement.service';
import { ErrorBoxComponent } from '../../shared/error-box.component';
import { IconComponent, IconName } from '../../shared/icon.component';
import { formatDate, formatDateTime, humanise, statusPill } from '../../shared/labels';

interface ActionCard {
  title: string;
  text: string;
  link: string;
  icon: IconName;
  primary: boolean;
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, IconComponent, ErrorBoxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {
  private requirementsApi = inject(RequirementService);
  readonly user = inject(AuthService).user;

  readonly summary = signal<DashboardSummary | null>(null);
  readonly summaryError = signal<ApiError | null>(null);
  readonly requirements = signal<Requirement[] | null>(null);
  readonly requirementsError = signal<ApiError | null>(null);

  readonly firstName = computed(() => (this.user()?.fullName ?? '').split(' ')[0]);

  readonly actions: ActionCard[] = [
    { title: 'Find people for a project', text: 'Describe the need and let the AI suggest the best people.', link: '/find-people', icon: 'sparkle', primary: true },
    { title: 'Review pending decisions', text: 'Approve, reject or park shortlisted people.', link: '/decisions', icon: 'check', primary: false },
    { title: 'Plan skill growth', text: 'See skill gaps and learning suggestions per project.', link: '/skill-growth', icon: 'trending', primary: false }
  ];

  readonly tiles = computed(() => {
    const s = this.summary();
    return [
      { label: 'Employees in the system', value: s?.total_employees },
      { label: 'Open projects', value: s?.open_requirements },
      { label: 'Free this month', value: s?.available_employees },
      { label: 'Waiting for approval', value: s?.pending_decisions }
    ];
  });

  readonly statusOf = requirementStatusOf;
  readonly statusPill = statusPill;
  readonly humanise = humanise;
  readonly formatDate = formatDate;
  readonly formatDateTime = formatDateTime;
  readonly recentRuns = computed(() => (this.summary()?.recent_runs ?? []).slice(0, 5));

  ngOnInit(): void {
    this.loadSummary();
    // this.loadRequirements(); // "Projects that need people" is hidden
  }

  loadSummary(): void {
    this.summaryError.set(null);
    this.requirementsApi.getDashboardSummary().subscribe({
      next: s => this.summary.set(s),
      error: err => this.summaryError.set(toApiError(err))
    });
  }

  loadRequirements(): void {
    this.requirementsError.set(null);
    this.requirements.set(null);
    this.requirementsApi.getRequirements().subscribe({
      next: list => this.requirements.set(list.filter(r => requirementStatusOf(r).toUpperCase() !== 'CLOSED').slice(0, 8)),
      error: err => {
        this.requirements.set([]);
        this.requirementsError.set(toApiError(err));
      }
    });
  }

  skillsLine(r: Requirement): string {
    return (r.required_skills ?? []).map(s => s.skill_name).join(', ') || 'No skills listed';
  }
}
