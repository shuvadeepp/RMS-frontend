import { Injectable, computed, inject, signal } from '@angular/core';
import { EMPTY, Observable, catchError, forkJoin, map, tap } from 'rxjs';
import { LlmMatch, MatchResult, MatchingRun, RequiredSkill, Requirement } from '../models/requirement.model';
import { TaggedPeopleSummary } from '../models/tagged-people.model';
import { EmployeeView } from '../shared/employee-view';
import { RequirementService } from './requirement.service';

// The Find People form, kept so back-navigation does not lose it.
export interface FindPeopleDraft {
  projectId: number | null;
  // Fallback for prefill when a saved requirement has no project_id.
  projectName: string;
  joiningDate: string;
  minExperience: number | null;
  designation: string;
  department: string;
  skills: RequiredSkill[];
}

export function emptyDraft(): FindPeopleDraft {
  return { projectId: null, projectName: '', joiningDate: '', minExperience: null, designation: '', department: '', skills: [] };
}

// What the results area shows: saved AI matches, an unsaved preview, or a plain employee list.
export type ResultMode = 'none' | 'matches' | 'preview' | 'employees';

// Holds the current requirement, run and results across screens.
@Injectable({ providedIn: 'root' })
export class MatchStateService {
  private requirementService = inject(RequirementService);

  readonly draft = signal<FindPeopleDraft>(emptyDraft());
  readonly mode = signal<ResultMode>('none');
  readonly requirementId = signal<number | null>(null);
  readonly requirement = signal<Requirement | null>(null);
  readonly runId = signal<number | null>(null);
  readonly run = signal<MatchingRun | null>(null);
  // When the current search was submitted (ms); keeps the scan console clock across page visits.
  readonly runStartedAt = signal<number | null>(null);
  readonly employeesSent = signal<number | null>(null);
  readonly matches = signal<MatchResult[]>([]);
  readonly preview = signal<LlmMatch[]>([]);
  readonly employees = signal<EmployeeView[]>([]);
  // From the search response; null when the backend did not send it.
  readonly taggedPeople = signal<TaggedPeopleSummary | null>(null);

  readonly sortedMatches = computed(() =>
    [...this.matches()].sort(
      (a, b) => (a.rank_position ?? 999) - (b.rank_position ?? 999) || (b.overall_score ?? 0) - (a.overall_score ?? 0)
    )
  );
  readonly shortlistedCount = computed(
    () => this.matches().filter(m => m.recommendation_status === 'RECOMMENDED').length
  );
  // A queued or running run whose results are not loaded yet.
  readonly runInProgress = computed(() => {
    const status = this.run()?.run_status;
    return this.runId() !== null && (status === undefined || status === 'QUEUED' || status === 'RUNNING');
  });

  clearResults(): void {
    this.mode.set('none');
    this.requirementId.set(null);
    this.runId.set(null);
    this.run.set(null);
    this.runStartedAt.set(null);
    this.employeesSent.set(null);
    this.matches.set([]);
    this.preview.set([]);
    this.employees.set([]);
    this.taggedPeople.set(null);
  }

  updateMatch(match: MatchResult): void {
    this.matches.update(list => list.map(m => (m.matching_result_id === match.matching_result_id ? match : m)));
  }

  findMatch(matchingResultId: number): MatchResult | undefined {
    return this.matches().find(m => m.matching_result_id === matchingResultId);
  }

  // After an allocation or release changes availability: refetch the held matches.
  // Preview and plain employee results came from a POST and cannot be refetched.
  refreshMatches(): void {
    const id = this.requirementId();
    if (this.mode() !== 'matches' || !id) return;
    this.requirementService.getMatches(id).pipe(catchError(() => EMPTY)).subscribe(matches => {
      if (this.requirementId() === id) this.matches.set(matches);
    });
  }

  // Reload a saved requirement and its latest matches without calling the AI.
  load(requirementId: number): Observable<void> {
    return forkJoin({
      requirement: this.requirementService.getRequirement(requirementId),
      matches: this.requirementService.getMatches(requirementId)
    }).pipe(
      tap(({ requirement, matches }) => {
        if (this.requirementId() !== requirementId) {
          this.runId.set(null);
          this.run.set(null);
          this.employeesSent.set(null);
        }
        this.requirementId.set(requirementId);
        this.requirement.set(requirement);
        this.matches.set(matches);
        this.mode.set('matches');
      }),
      map(() => undefined)
    );
  }
}
