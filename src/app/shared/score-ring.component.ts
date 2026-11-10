import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { categoryOf } from './labels';

// Round score badge filled with a conic gradient in the category colour.
@Component({
  selector: 'app-score-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ring" [style.width.px]="size()" [style.height.px]="size()"
         [style.background]="background()" role="img" [attr.aria-label]="'Match score ' + rounded() + ' percent'">
      <div class="ring-inner">
        <span class="ring-value" [style.font-size.px]="size() * 0.28">{{ rounded() }}</span>
        <span class="ring-unit">%</span>
      </div>
    </div>
  `,
  styles: `
    :host { display: inline-flex; flex: none; }
    .ring { border-radius: 50%; display: grid; place-items: center; }
    .ring-inner {
      width: calc(100% - 14px); height: calc(100% - 14px); border-radius: 50%;
      background: var(--card); display: flex; align-items: baseline; justify-content: center; padding-top: 0;
      align-content: center; flex-wrap: wrap;
    }
    .ring-value { font-weight: 800; color: var(--ink); line-height: 1; }
    .ring-unit { font-size: 11px; font-weight: 800; color: var(--muted); margin-left: 1px; }
  `
})
export class ScoreRingComponent {
  readonly score = input<number | null | undefined>(0);
  readonly category = input<string | null | undefined>(null);
  readonly size = input<number>(72);

  readonly rounded = computed(() => Math.round(Math.max(0, Math.min(100, this.score() ?? 0))));
  readonly background = computed(() => {
    const color = categoryOf(this.score(), this.category()).ring;
    return `conic-gradient(${color} ${this.rounded()}%, var(--low-bg) 0)`;
  });
}
