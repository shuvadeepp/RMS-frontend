import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiError, toApiError } from '../../core/error-message';
import { ToastService } from '../../core/toast.service';
import { LearningRecommendation, MatchResult, SkillGapReport, SkillObject } from '../../models/requirement.model';
import { LearningService } from '../../services/learning.service';
import { MatchStateService } from '../../services/match-state.service';
import { DecisionControlsComponent } from '../../shared/decision-controls.component';
import { ErrorBoxComponent } from '../../shared/error-box.component';
import { IconComponent } from '../../shared/icon.component';
import { availabilityOf, categoryOf, initials, skillName, skillNames } from '../../shared/labels';
import { LearningListComponent } from '../../shared/learning-list.component';
import { ScoreRingComponent } from '../../shared/score-ring.component';

interface SkillRow {
  name: string;
  mandatory: boolean;
  required: number | null;
  level: number | null;
  state: 'meets' | 'below' | 'missing';
  note: string | null;
}

@Component({
  selector: 'app-candidate',
  imports: [RouterLink, IconComponent, ScoreRingComponent, ErrorBoxComponent, DecisionControlsComponent, LearningListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './candidate.component.html',
  styleUrl: './candidate.component.scss'
})
export class CandidateComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private learning = inject(LearningService);
  private toast = inject(ToastService);
  readonly state = inject(MatchStateService);

  readonly id = Number(this.route.snapshot.paramMap.get('matchingResultId'));
  readonly requirementId = signal<number | null>(
    Number(this.route.snapshot.queryParamMap.get('requirementId')) || this.state.requirementId()
  );

  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);
  readonly report = signal<SkillGapReport | null>(null);
  readonly reportError = signal<ApiError | null>(null);
  readonly generating = signal(false);

  readonly match = computed(() => this.state.findMatch(this.id) ?? null);
  readonly name = computed(() => this.match()?.resource_name ?? this.report()?.resource_name ?? '');
  readonly code = computed(() => this.match()?.employee_code ?? this.report()?.employee_code ?? '');
  readonly category = computed(() => categoryOf(this.match()?.overall_score, this.match()?.match_category));
  readonly availability = computed(() => availabilityOf(this.match()?.availability));
  readonly avatar = computed(() => initials(this.name()));
  readonly backQuery = computed(() => ({ requirementId: this.requirementId() }));

  // Gaps from the backend, plus matching skills (from the match) as "meets" rows.
  readonly rows = computed<SkillRow[]>(() => {
    const gaps = this.report()?.gaps ?? [];
    const required = this.state.requirement()?.required_skills ?? [];
    const rows: SkillRow[] = gaps.map(g => {
      const level = g.current_level ?? 0;
      const need = g.required_level ?? 0;
      const state: SkillRow['state'] = level <= 0 ? 'missing' : level < need ? 'below' : 'meets';
      return { name: g.skill_name, mandatory: g.mandatory, required: g.required_level, level: g.current_level, state, note: g.gap_description ?? null };
    });
    const seen = new Set(rows.map(r => r.name.toLowerCase()));
    for (const ref of this.match()?.strengths?.matching_skills ?? []) {
      const name = skillName(ref);
      if (!name || seen.has(name.toLowerCase())) continue;
      const obj: SkillObject | null = typeof ref === 'string' ? null : ref;
      const req = required.find(r => r.skill_name.toLowerCase() === name.toLowerCase());
      rows.push({
        name,
        mandatory: req?.mandatory ?? false,
        required: obj?.required_proficiency ?? obj?.minimum_proficiency ?? req?.minimum_proficiency ?? null,
        level: obj?.current_proficiency ?? obj?.employee_proficiency ?? obj?.proficiency ?? null,
        state: 'meets',
        note: null
      });
    }
    return rows;
  });
  readonly transferable = computed(() => skillNames(this.match()?.strengths?.transferable_skills));
  readonly recommendations = computed(() => this.report()?.learning_recommendations ?? []);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const reqId = this.requirementId();
    if (!this.match() && reqId) {
      this.state.load(reqId).subscribe({
        next: () => this.loading.set(false),
        error: err => {
          this.error.set(toApiError(err));
          this.loading.set(false);
        }
      });
    } else {
      this.loading.set(false);
    }
    this.loadReport();
  }

  loadReport(): void {
    this.reportError.set(null);
    this.learning.getSkillGaps(this.id).subscribe({
      next: r => this.report.set(r),
      error: err => this.reportError.set(toApiError(err))
    });
  }

  generate(): void {
    this.generating.set(true);
    this.learning.generate(this.id).subscribe({
      next: res => {
        this.generating.set(false);
        if (res?.note) this.toast.info(res.note);
        this.loadReport();
      },
      error: err => {
        this.generating.set(false);
        this.toast.error(`Could not generate a learning plan: ${toApiError(err).title}`);
      }
    });
  }

  onRecommendationChanged(updated: LearningRecommendation): void {
    this.report.update(r => r && {
      ...r,
      learning_recommendations: r.learning_recommendations.map(x =>
        x.learning_recommendation_id === updated.learning_recommendation_id ? updated : x
      )
    });
  }

  onMatchChanged(match: MatchResult): void {
    this.state.updateMatch(match);
  }

  statusText(r: SkillRow): string {
    if (r.state === 'meets') return r.level ? `Meets the need · level ${r.level}` : 'Meets the need';
    if (r.state === 'missing') return `Missing · needs level ${r.required ?? '?'}`;
    return `Below level · has ${r.level}, needs ${r.required}`;
  }
}
