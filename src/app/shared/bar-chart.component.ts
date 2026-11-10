import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface BarRow {
  label: string;
  count: number;
  color?: string;
}

// Horizontal bars, one series. Every bar carries its label and value as text, so colour is never the only cue.
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length === 0) {
      <p class="state">No data yet.</p>
    } @else {
      <ul class="bars" [attr.aria-label]="label()">
        @for (r of rows(); track r.label) {
          <li class="bar-row" [attr.title]="r.label + ': ' + r.count">
            <span class="bar-label">{{ r.label }}</span>
            <span class="track">
              <span class="fill" [style.width.%]="max() ? (r.count / max()) * 100 : 0"
                    [style.background]="r.color || 'var(--primary)'"></span>
            </span>
            <span class="bar-value">{{ r.count }}</span>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .bars { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .bar-row { display: grid; grid-template-columns: minmax(90px, 140px) 1fr 40px; align-items: center; gap: 10px; font-size: 14px; }
    .bar-row:hover .bar-label { color: var(--ink); }
    .bar-label { color: var(--muted); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .track { height: 14px; border-radius: 0 4px 4px 0; background: transparent; border-left: 1px solid var(--border); }
    .fill { display: block; height: 100%; min-width: 2px; border-radius: 0 4px 4px 0; transition: width .3s ease-out; }
    .bar-value { font-weight: 800; text-align: right; font-variant-numeric: tabular-nums; }
    @media (prefers-reduced-motion: reduce) { .fill { transition: none; } }
  `
})
export class BarChartComponent {
  readonly rows = input.required<BarRow[]>();
  readonly label = input('Chart');
  readonly max = computed(() => Math.max(0, ...this.rows().map(r => r.count)));
}
