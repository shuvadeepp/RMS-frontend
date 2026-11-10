import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { MatchingRun, MatchingRunProgress } from '../models/requirement.model';

// Which part of the search the page is in while the console is shown.
export type ScanPhase = 'submitting' | 'running' | 'loading-results';

type LineState = 'done' | 'current';
interface ActivityLine { text: string; state: LineState; }
interface StatTile { label: string; value: string; sub?: string; tone?: 'success'; }
interface StageBar { name: string; pct: number; label: string; state: 'done' | 'current' | 'waiting'; }

const STAGES = ['Reading profiles', 'Scoring skills', 'Writing explanations'] as const;
// Estimated stage windows (seconds since submit): the API does not report the stage yet.
const READING_END_S = 8;
const SCORING_END_S = 45;
const SLOW_AFTER_S = 120;
// Estimates stop short of 100% so a bar only fills when the run is really done.
const MAX_ESTIMATE = 95;
const MAX_SCORED_LINES = 4;

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Maps a backend stage name (any casing or wording) to a stage index, or null when unknown.
function stageIndexOf(stage: string | null | undefined): number | null {
  const s = (stage ?? '').toLowerCase();
  if (!s) return null;
  if (s.includes('read') || s.includes('load') || s.includes('fetch') || s.includes('prepar')) return 0;
  if (s.includes('scor') || s.includes('match')) return 1;
  if (s.includes('writ') || s.includes('explain') || s.includes('summar')) return 2;
  return null;
}

// "Live scan console": full-width dark loading view shown while a matching run is in progress.
@Component({
  selector: 'app-scan-console',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="console" aria-labelledby="scan-title">
      <header class="head">
        <div class="title-row">
          <span class="live-dot" aria-hidden="true"></span>
          <h1 id="scan-title" class="title">AI is working on your search</h1>
        </div>
        <p class="run-meta">
          @if (runId(); as id) { Run #{{ id }} } @else { Starting }
          · <span class="num">{{ elapsedText() }}</span> elapsed
        </p>
      </header>
      <p class="sr-only" role="status" aria-live="polite">{{ announcement() }}</p>

      <ul class="stats" aria-label="Search summary">
        @for (t of tiles(); track t.label) {
          <li class="sc-card stat">
            <span class="stat-label">{{ t.label }}</span>
            <span class="stat-value" [class.success]="t.tone === 'success'">
              {{ t.value }}@if (t.sub) { <span class="stat-sub">{{ t.sub }}</span> }
            </span>
          </li>
        }
      </ul>

      <div class="panels">
        <div class="sc-card activity">
          <span class="scan" aria-hidden="true"></span>
          <h2 class="card-title">Live activity</h2>
          <ul class="lines">
            @for (line of lines(); track line.text) {
              <li class="line" [class.current]="line.state === 'current'">
                @if (line.state === 'done') {
                  <svg class="tick" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <span class="sr-only">Done: </span>
                } @else {
                  <span class="pulse" aria-hidden="true"></span>
                  <span class="sr-only">In progress: </span>
                }
                <span>{{ line.text }}</span>
              </li>
            }
          </ul>
        </div>

        <div class="sc-card progress">
          <h2 class="card-title">Progress</h2>
          <ul class="bars">
            @for (b of bars(); track b.name) {
              <li class="bar-row" [class.done]="b.state === 'done'" [class.current]="b.state === 'current'">
                <div class="bar-head">
                  <span>{{ b.name }}</span>
                  <span class="bar-label">{{ b.label }}</span>
                </div>
                <div class="track" role="progressbar" [attr.aria-label]="b.name"
                     aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="b.pct" [attr.aria-valuetext]="b.label">
                  <span class="fill" [style.width.%]="b.pct"></span>
                </div>
              </li>
            }
          </ul>
          @if (estimated()) { <p class="estimate">Steps are estimated</p> }

          <p class="leave-note" [class.slow]="slow()">
            Taking long? You can leave this page. The run continues and results will be in
            <strong>Projects → See matches</strong>.
          </p>
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      /* Follows the app theme: in dark mode these equal the approved console palette. */
      --scan-bg: var(--bg); --scan-card: var(--card); --scan-border: var(--border);
      --scan-text: var(--ink); --scan-muted: var(--muted); --scan-accent: var(--primary); --scan-success: var(--excellent-text);
      display: block;
      /* Bleeds over the shell's .main padding so the dark console fills the content area. */
      margin: -32px -40px;
    }
    .console {
      min-height: 100vh; padding: 32px 40px; box-sizing: border-box;
      background: var(--scan-bg); color: var(--scan-text);
      display: flex; flex-direction: column; gap: 18px;
    }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 8px 16px; flex-wrap: wrap; }
    .title-row { display: flex; align-items: center; gap: 12px; }
    .title { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -.01em; color: var(--scan-text); }
    .run-meta { margin: 0; color: var(--scan-muted); font-weight: 600; font-size: 14px; }
    .num { font-variant-numeric: tabular-nums; }
    .live-dot {
      width: 10px; height: 10px; border-radius: 50%; flex: none;
      background: var(--scan-success); box-shadow: 0 0 0 4px rgba(52, 211, 153, .18);
      animation: blink 1.4s ease-in-out infinite;
    }

    .sc-card { background: var(--scan-card); border: 1px solid var(--scan-border); border-radius: 14px; }
    .card-title { margin: 0 0 14px; font-size: 14px; font-weight: 700; color: var(--scan-muted); }

    .stats {
      list-style: none; margin: 0; padding: 0;
      display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;
    }
    .stat { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; min-width: 0; }
    .stat-label { font-size: 13px; font-weight: 600; color: var(--scan-muted); }
    .stat-value { font-size: 22px; font-weight: 800; line-height: 1.2; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
    .stat-value.success { color: var(--scan-success); }
    .stat-sub { margin-left: 6px; font-size: 14px; font-weight: 700; color: var(--scan-muted); }

    .panels { flex: 1; display: grid; grid-template-columns: 1.15fr 1fr; gap: 16px; align-items: stretch; }
    .activity, .progress { padding: 18px 20px; min-height: 320px; display: flex; flex-direction: column; }
    .progress { gap: 14px; }
    .progress .card-title { margin: 0; }

    .activity { position: relative; overflow: hidden; }
    .scan {
      position: absolute; left: 0; right: 0; top: 0; height: 2px; pointer-events: none;
      background: linear-gradient(90deg, transparent, var(--scan-accent) 30%, #A9B4FF 50%, var(--scan-accent) 70%, transparent);
      box-shadow: 0 0 14px 2px rgba(108, 124, 255, .45);
      animation: scan 3.6s ease-in-out infinite alternate;
    }
    .lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; position: relative; }
    .line { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; font-weight: 600; line-height: 1.4; }
    .line.current { color: var(--scan-muted); }
    .tick { width: 16px; height: 16px; flex: none; margin-top: 2px; color: var(--scan-success); }
    .pulse {
      width: 8px; height: 8px; margin: 6px 4px 0; flex: none; border-radius: 50%;
      background: var(--scan-accent); animation: blink 1s ease-in-out infinite;
    }

    .bars { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 16px; }
    .bar-head { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; font-weight: 600; margin-bottom: 8px; }
    .bar-label { color: var(--scan-muted); font-variant-numeric: tabular-nums; }
    .bar-row.done .bar-label { color: var(--scan-success); }
    .bar-row.current .bar-label { color: var(--scan-text); }
    .track { height: 6px; border-radius: 999px; background: var(--scan-border); overflow: hidden; }
    .fill { display: block; height: 100%; border-radius: inherit; background: var(--scan-accent); transition: width 1s linear; }
    .bar-row.done .fill { background: var(--scan-success); }
    .estimate { margin: -4px 0 0; font-size: 12px; color: var(--scan-muted); }

    .leave-note {
      margin: auto 0 0; padding: 12px 14px; border-radius: 10px; font-size: 13px; line-height: 1.5;
      background: var(--scan-bg); color: var(--scan-text); border: 1px solid transparent;
    }
    .leave-note strong { font-weight: 700; }
    .leave-note.slow { border-color: var(--scan-accent); }

    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
    @keyframes scan { from { top: 0; } to { top: calc(100% - 2px); } }

    @media (max-width: 900px) {
      :host { margin: -20px -16px -40px; }
      .console { padding: 20px 16px 40px; min-height: calc(100vh - 68px); }
    }
    @media (max-width: 760px) {
      .panels { grid-template-columns: 1fr; }
      .activity, .progress { min-height: 0; }
      .activity { min-height: 220px; }
      .title { font-size: 20px; }
      .stat-value { font-size: 20px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .scan { display: none; }
      .live-dot, .pulse { animation: none; }
      .fill { transition: none; }
    }
  `
})
export class ScanConsoleComponent {
  readonly phase = input.required<ScanPhase>();
  readonly runId = input<number | null>(null);
  readonly run = input<MatchingRun | null>(null);
  readonly employeesSent = input<number | null>(null);
  readonly skills = input<string[]>([]);
  readonly requirementSaved = input(false);
  // Epoch ms when the search was submitted; falls back to when the console appeared.
  readonly startedAt = input<number | null>(null);

  private readonly mountedAt = Date.now();
  private readonly now = signal(Date.now());

  // Real progress (only if the backend sends it); every field is optional.
  private readonly progress = computed<MatchingRunProgress | null>(() => this.run()?.progress ?? null);
  private readonly realStage = computed(() => stageIndexOf(this.progress()?.stage));
  private readonly stageEnteredAt = signal(Date.now());
  private readonly scored = signal<string[]>([]);
  private lastScoredName: string | null = null;

  private readonly elapsedMs = computed(() => Math.max(0, this.now() - (this.startedAt() ?? this.mountedAt)));
  readonly elapsedS = computed(() => Math.floor(this.elapsedMs() / 1000));
  readonly elapsedText = computed(() => formatElapsed(this.elapsedS()));
  readonly slow = computed(() => this.elapsedS() >= SLOW_AFTER_S && !this.completed());

  readonly completed = computed(() => {
    const status = this.run()?.run_status;
    return this.phase() === 'loading-results' || status === 'COMPLETED' || status === 'COMPLETED_WITH_ERRORS';
  });
  readonly estimated = computed(() => !this.completed() && this.realStage() === null);

  // 0..2 = current stage, 3 = everything done.
  readonly stageIndex = computed(() => {
    if (this.completed()) return STAGES.length;
    const real = this.realStage();
    if (real !== null) return real;
    const s = this.elapsedS();
    return s < READING_END_S ? 0 : s < SCORING_END_S ? 1 : 2;
  });

  readonly stageText = computed(() => {
    if (this.completed()) return 'Finished';
    if (this.phase() === 'submitting') return 'Starting';
    if (this.slow()) return 'Still working';
    return STAGES[this.stageIndex()];
  });

  readonly statusText = computed(() => {
    if (this.completed()) return 'Finished';
    if (this.phase() === 'submitting') return 'Starting';
    return this.run()?.run_status === 'RUNNING' ? 'Running' : 'Queued';
  });

  readonly announcement = computed(() =>
    this.completed() ? 'Search finished. Opening your results.' : `${this.statusText()}. ${this.stageText()}.`
  );

  readonly tiles = computed<StatTile[]>(() => {
    const sent = this.employeesSent();
    const p = this.progress();
    const tiles: StatTile[] = [
      { label: 'People in pool', value: sent === null ? '–' : String(sent) },
      { label: 'Stage', value: this.stageText() },
      { label: 'Elapsed', value: this.elapsedText() },
      { label: 'Status', value: this.statusText() }
    ];
    if (p?.processed != null && p.total != null) {
      tiles.push({ label: 'Profiles scored', value: String(p.processed), sub: `of ${p.total}` });
    }
    if (p?.best_score != null) {
      tiles.push({ label: 'Best score so far', value: String(Math.round(p.best_score * 10) / 10), tone: 'success' });
    }
    return tiles;
  });

  readonly lines = computed<ActivityLine[]>(() => {
    const out: ActivityLine[] = [];
    if (!this.requirementSaved()) {
      out.push({ text: 'Saving your requirement…', state: 'current' });
      return out;
    }
    const skills = this.skills();
    out.push({ text: skills.length ? `Requirement saved · ${skills.join(', ')}` : 'Requirement saved', state: 'done' });

    const sent = this.employeesSent();
    if (sent !== null) out.push({ text: `Found ${sent} ${sent === 1 ? 'person' : 'people'} to compare`, state: 'done' });

    for (const name of this.scored()) out.push({ text: `${name} scored`, state: 'done' });

    if (this.completed()) {
      out.push({ text: 'Matching finished', state: 'done' });
      out.push({ text: 'Opening your results…', state: 'current' });
      return out;
    }
    const current = this.progress()?.current_employee_name;
    const stage = this.stageIndex();
    out.push({
      text: stage === 1 && current ? `Scoring ${current}…` : `${STAGES[stage]}…`,
      state: 'current'
    });
    return out;
  });

  readonly bars = computed<StageBar[]>(() => {
    const current = this.stageIndex();
    return STAGES.map((name, i): StageBar => {
      if (i < current) return { name, pct: 100, label: 'Done', state: 'done' };
      if (i > current) return { name, pct: 0, label: 'Waiting', state: 'waiting' };
      const pct = Math.round(this.currentStagePct(i));
      return { name, pct, label: `${pct}%`, state: 'current' };
    });
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // Restart the per-stage clock whenever the (real) stage changes.
    effect(() => {
      this.realStage();
      this.stageEnteredAt.set(untracked(this.now));
    });

    // Each time the backend moves to a new person, the previous one is done.
    effect(() => {
      const name = this.progress()?.current_employee_name ?? null;
      if (!name || name === this.lastScoredName) return;
      const prev = this.lastScoredName;
      this.lastScoredName = name;
      if (prev) this.scored.update(list => [...list, prev].slice(-MAX_SCORED_LINES));
    });
  }

  // Smooth estimate for the stage in progress; never reaches 100 before the run completes.
  private currentStagePct(i: number): number {
    const p = this.progress();
    if (i === 1 && p?.processed != null && p.total) {
      return Math.min(99, (p.processed / p.total) * 100);
    }
    if (this.realStage() !== null) {
      const t = (this.now() - this.stageEnteredAt()) / 1000;
      return MAX_ESTIMATE * (1 - Math.exp(-t / 20));
    }
    const s = this.elapsedMs() / 1000;
    if (i === 0) return Math.min(MAX_ESTIMATE, (s / READING_END_S) * MAX_ESTIMATE);
    if (i === 1) return Math.min(MAX_ESTIMATE, ((s - READING_END_S) / (SCORING_END_S - READING_END_S)) * MAX_ESTIMATE);
    return MAX_ESTIMATE * (1 - Math.exp(-(s - SCORING_END_S) / 45));
  }
}
