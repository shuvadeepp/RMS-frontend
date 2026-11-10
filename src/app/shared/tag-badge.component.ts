import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { tagInfo } from './labels';

// Allocation tags: red = fully allocated, amber = partially.
// Blue = approved elsewhere, pending allocation (AI search only, informational, blocks nobody).
// The backend "reason" is the tooltip; freePercent adds "- 50% free" to partial tags.
@Component({
  selector: 'app-tag-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pill" [class]="info().css" [attr.title]="reason() || null">{{ text() }}</span>`
})
export class TagBadgeComponent {
  readonly tag = input.required<string | null | undefined>();
  readonly reason = input<string | null | undefined>(null);
  readonly freePercent = input<number | null | undefined>(null);

  readonly info = computed(() => tagInfo(this.tag()));
  readonly text = computed(() => {
    const free = this.freePercent();
    const partial = (this.tag() ?? '').toUpperCase() === 'PARTIALLY_ALLOCATED';
    return partial && free !== null && free !== undefined ? `${this.info().label} - ${free}% free` : this.info().label;
  });
}
