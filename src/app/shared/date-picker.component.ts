import {
  ChangeDetectionStrategy, Component, ElementRef, computed, forwardRef, inject, input, output, signal, viewChild
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IconComponent } from './icon.component';
import { formatDayMonYear, parseTimestamp, toIsoDate } from './labels';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface DayCell { iso: string; day: number; inMonth: boolean; disabled: boolean; today: boolean; }

// Calendar date picker. Works with ngModel; the value is an ISO date string ("2026-12-01") or ''.
@Component({
  selector: 'app-date-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DatePickerComponent), multi: true }],
  host: {
    class: 'date-picker',
    '(focusout)': 'onFocusOut($event)',
    '(document:pointerdown)': 'onDocumentPointer($event)'
  },
  template: `
    <div class="dp-control" [class.invalid]="invalid()" [class.disabled]="disabled()">
      <button #trigger type="button" class="dp-trigger" [id]="inputId()" [disabled]="disabled()"
              aria-haspopup="dialog" [attr.aria-expanded]="open()" [attr.aria-required]="required() || null"
              [attr.aria-invalid]="invalid() || null" [attr.aria-describedby]="describedBy()"
              (click)="toggle()" (keydown.arrowdown)="openPicker(); $event.preventDefault()">
        <span [class.placeholder]="!value()">{{ value() ? display() : placeholder() }}</span>
      </button>
      @if (value() && !required() && !disabled()) {
        <button type="button" class="dp-icon-btn" (click)="clear()" aria-label="Clear date">
          <app-icon name="x" [size]="18" />
        </button>
      }
      <span class="dp-icon" aria-hidden="true"><app-icon name="calendar" [size]="18" /></span>
    </div>

    @if (open()) {
      <div class="dp-popup" [class.up]="openUp()" role="dialog" aria-modal="false" [attr.aria-label]="'Choose date'"
           (keydown.escape)="close(true); $event.stopPropagation()">
        <div class="dp-head">
          <button type="button" class="dp-nav" (click)="shiftMonth(-1)" [disabled]="!canGo(-1)" aria-label="Previous month">
            <app-icon name="arrow-left" [size]="18" />
          </button>
          <div class="dp-selects">
            <select class="dp-select" aria-label="Month" [value]="viewMonth()" (change)="setMonth(+$any($event.target).value)">
              @for (m of months; track $index) { <option [value]="$index">{{ m }}</option> }
            </select>
            <select class="dp-select" aria-label="Year" [value]="viewYear()" (change)="setYear(+$any($event.target).value)">
              @for (y of years(); track y) { <option [value]="y">{{ y }}</option> }
            </select>
          </div>
          <button type="button" class="dp-nav" (click)="shiftMonth(1)" [disabled]="!canGo(1)" aria-label="Next month">
            <app-icon name="arrow-right" [size]="18" />
          </button>
        </div>

        <table class="dp-grid" role="grid" [attr.aria-label]="months[viewMonth()] + ' ' + viewYear()">
          <thead><tr>@for (w of weekdays; track w) { <th scope="col" [attr.abbr]="w">{{ w }}</th> }</tr></thead>
          <tbody (keydown)="onGridKey($event)">
            @for (week of weeks(); track $index) {
              <tr>
                @for (c of week; track c.iso) {
                  <td>
                    <button type="button" class="dp-day" [attr.data-iso]="c.iso"
                            [class.out]="!c.inMonth" [class.today]="c.today" [class.selected]="c.iso === value()"
                            [disabled]="c.disabled" [attr.tabindex]="c.iso === focusIso() ? 0 : -1"
                            [attr.aria-selected]="c.iso === value()" [attr.aria-current]="c.today ? 'date' : null"
                            [attr.aria-label]="label(c.iso)" (click)="pick(c.iso)">{{ c.day }}</button>
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>

        <div class="dp-foot">
          <button type="button" class="dp-link" (click)="pick(todayIso)" [disabled]="outOfRange(todayIso)">Today</button>
        </div>
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: block; width: 100%; }
    .dp-control {
      position: relative; display: flex; align-items: center;
      height: 46px; border: 1px solid var(--input-border); border-radius: 10px; background: var(--surface);
    }
    .dp-control:focus-within { border-color: var(--primary); }
    .dp-control.invalid { border-color: var(--danger-text); }
    .dp-control.disabled { background: var(--bg); }
    .dp-trigger {
      flex: 1; height: 100%; min-width: 0; padding: 0 42px 0 14px; text-align: left;
      background: none; border: 0; border-radius: 10px; cursor: pointer; font-size: 15px;
    }
    .dp-trigger:disabled { cursor: not-allowed; }
    .placeholder { color: var(--muted); }
    .dp-icon { position: absolute; right: 14px; color: var(--muted); pointer-events: none; }
    .dp-icon-btn {
      position: absolute; right: 40px; display: inline-flex; padding: 4px;
      background: none; border: 0; border-radius: 6px; color: var(--muted); cursor: pointer;
    }
    .dp-icon-btn:hover { color: var(--ink); background: var(--bg); }

    .dp-popup {
      position: absolute; top: calc(100% + 6px); left: 0; z-index: 60;
      width: 300px; max-width: calc(100vw - 32px); padding: 12px;
      background: var(--card); border: 1px solid var(--border); border-radius: 14px;
      box-shadow: 0 12px 32px rgba(15, 27, 61, .16);
    }
    .dp-popup.up { top: auto; bottom: calc(100% + 6px); }
    .dp-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 8px; }
    .dp-selects { display: flex; gap: 6px; }
    .dp-select {
      height: 34px; padding: 0 6px; border: 1px solid var(--input-border); border-radius: 8px;
      background: var(--surface); font-size: 14px; font-weight: 700;
    }
    .dp-nav {
      display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px;
      background: none; border: 1px solid transparent; border-radius: 8px; color: var(--ink); cursor: pointer;
    }
    .dp-nav:hover:not(:disabled) { background: var(--primary-tint); }
    .dp-nav:disabled { opacity: .35; cursor: not-allowed; }

    .dp-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .dp-grid th { padding: 4px 0; font-size: 12px; font-weight: 700; color: var(--muted); text-align: center; }
    .dp-grid td { padding: 2px; text-align: center; }
    .dp-day {
      width: 100%; aspect-ratio: 1; max-height: 38px; border: 1px solid transparent; border-radius: 8px;
      background: none; font-size: 14px; cursor: pointer;
    }
    .dp-day:hover:not(:disabled) { background: var(--primary-tint); }
    .dp-day.out { color: var(--faint); }
    .dp-day.today { border-color: var(--primary); font-weight: 800; }
    .dp-day.selected { background: var(--primary); border-color: var(--primary); color: #fff; font-weight: 800; }
    .dp-day:disabled { color: var(--faint); opacity: .6; text-decoration: line-through; cursor: not-allowed; }

    .dp-foot { display: flex; justify-content: flex-end; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
    .dp-link {
      padding: 4px 10px; background: none; border: 0; border-radius: 6px;
      color: var(--primary-dark); font-weight: 700; font-size: 13px; cursor: pointer;
    }
    .dp-link:hover:not(:disabled) { background: var(--primary-tint); }
    .dp-link:disabled { opacity: .45; cursor: not-allowed; }
  `
})
export class DatePickerComponent implements ControlValueAccessor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  readonly inputId = input<string | null>(null);
  readonly placeholder = input('Select date');
  readonly required = input(false);
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);
  // Fires when focus leaves the picker (trigger and popup), like an input's blur.
  readonly touched = output<void>();

  readonly months = MONTHS;
  readonly weekdays = WEEKDAYS;
  readonly todayIso = toIsoDate(new Date());

  readonly value = signal('');
  readonly disabled = signal(false);
  readonly open = signal(false);
  readonly openUp = signal(false);
  readonly viewYear = signal(new Date().getFullYear());
  readonly viewMonth = signal(new Date().getMonth());
  readonly focusIso = signal(this.todayIso);

  readonly display = computed(() => formatDayMonYear(this.value()));

  readonly years = computed(() => {
    const now = new Date().getFullYear();
    const from = Math.min(parseTimestamp(this.min())?.getFullYear() ?? now - 10, this.viewYear());
    const to = Math.max(parseTimestamp(this.max())?.getFullYear() ?? now + 10, this.viewYear());
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  });

  readonly weeks = computed<DayCell[][]>(() => {
    const year = this.viewYear(), month = this.viewMonth();
    const start = new Date(year, month, 1 - new Date(year, month, 1).getDay());
    const weeks: DayCell[][] = [];
    for (let w = 0; w < 6; w++) {
      const week: DayCell[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
        const iso = toIsoDate(date);
        week.push({ iso, day: date.getDate(), inMonth: date.getMonth() === month,
          disabled: this.outOfRange(iso), today: iso === this.todayIso });
      }
      weeks.push(week);
    }
    return weeks;
  });

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(parseTimestamp(value) ? (value as string).slice(0, 10) : '');
  }
  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
    if (disabled) this.open.set(false);
  }

  toggle(): void {
    if (this.open()) this.close(false); else this.openPicker();
  }

  openPicker(): void {
    if (this.disabled() || this.open()) return;
    const start = this.value() || this.clamp(this.todayIso);
    this.showMonthOf(start);
    this.focusIso.set(start);
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.openUp.set(window.innerHeight - rect.bottom < 380 && rect.top > 380);
    this.open.set(true);
    this.focusDay();
  }

  close(returnFocus: boolean): void {
    this.open.set(false);
    if (returnFocus) this.trigger().nativeElement.focus();
  }

  pick(iso: string): void {
    if (this.outOfRange(iso)) return;
    this.setValue(iso);
    this.close(true);
  }

  clear(): void {
    this.setValue('');
    this.trigger().nativeElement.focus();
  }

  shiftMonth(delta: number): void {
    const date = new Date(this.viewYear(), this.viewMonth() + delta, 1);
    this.viewYear.set(date.getFullYear());
    this.viewMonth.set(date.getMonth());
  }
  setMonth(month: number): void { this.viewMonth.set(month); }
  setYear(year: number): void { this.viewYear.set(year); }

  canGo(delta: number): boolean {
    const bound = parseTimestamp(delta < 0 ? this.min() : this.max());
    if (!bound) return true;
    const target = this.viewYear() * 12 + this.viewMonth() + delta;
    const limit = bound.getFullYear() * 12 + bound.getMonth();
    return delta < 0 ? target >= limit : target <= limit;
  }

  outOfRange(iso: string): boolean {
    const min = this.min(), max = this.max();
    return (!!min && iso < min.slice(0, 10)) || (!!max && iso > max.slice(0, 10));
  }

  label(iso: string): string {
    return parseTimestamp(iso)!.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  onGridKey(event: KeyboardEvent): void {
    const current = parseTimestamp(this.focusIso())!;
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(current, -1),
      ArrowRight: () => addDays(current, 1),
      ArrowUp: () => addDays(current, -7),
      ArrowDown: () => addDays(current, 7),
      Home: () => addDays(current, -current.getDay()),
      End: () => addDays(current, 6 - current.getDay()),
      PageUp: () => addMonths(current, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(current, event.shiftKey ? 12 : 1)
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const iso = this.clamp(toIsoDate(move()));
    this.focusIso.set(iso);
    this.showMonthOf(iso);
    this.focusDay();
  }

  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && this.host.nativeElement.contains(next)) return;
    // Clicks on non-focusable parts of the popup leave relatedTarget null; let pointerdown decide.
    if (!next && this.open()) return;
    this.open.set(false);
    this.markTouched();
  }

  onDocumentPointer(event: PointerEvent): void {
    if (!this.open() || this.host.nativeElement.contains(event.target as Node)) return;
    this.open.set(false);
    this.markTouched();
  }

  private setValue(iso: string): void {
    this.value.set(iso);
    this.onChange(iso);
  }

  private markTouched(): void {
    this.onTouched();
    this.touched.emit();
  }

  private clamp(iso: string): string {
    const min = this.min()?.slice(0, 10), max = this.max()?.slice(0, 10);
    if (min && iso < min) return min;
    if (max && iso > max) return max;
    return iso;
  }

  private showMonthOf(iso: string): void {
    const date = parseTimestamp(iso)!;
    this.viewYear.set(date.getFullYear());
    this.viewMonth.set(date.getMonth());
  }

  private focusDay(): void {
    // Wait for the popup and the new month to render.
    setTimeout(() => {
      const el = this.host.nativeElement.querySelector<HTMLButtonElement>(`.dp-day[data-iso="${this.focusIso()}"]`);
      el?.focus();
    });
  }
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
}
