import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-toasts',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" role="region" aria-label="Notifications" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="'toast-' + t.kind" [attr.role]="t.kind === 'error' ? 'alert' : 'status'">
          <app-icon [name]="t.kind === 'error' ? 'alert' : 'check'" [size]="18" />
          <span class="text">{{ t.text }}</span>
          <button type="button" class="close" (click)="toast.dismiss(t.id)">
            <app-icon name="x" [size]="16" /><span class="sr-only">Dismiss</span>
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts { position: fixed; right: 20px; bottom: 20px; z-index: 200; display: flex; flex-direction: column; gap: 10px; width: min(380px, calc(100vw - 32px)); }
    .toast {
      display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px;
      background: var(--card); border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(15, 27, 61, .15);
      font-weight: 600; font-size: 14px; animation: rise .2s ease-out;
    }
    .toast-success { border-left: 4px solid var(--excellent-ring); }
    .toast-success app-icon { color: var(--excellent-text); }
    .toast-error { border-left: 4px solid var(--danger-text); }
    .toast-error app-icon { color: var(--danger-text); }
    .toast-info { border-left: 4px solid var(--primary); }
    .text { flex: 1; }
    .close { background: none; border: 0; cursor: pointer; color: var(--muted); padding: 2px; display: inline-flex; }
    @keyframes rise { from { transform: translateY(8px); opacity: 0; } }
    @media (max-width: 600px) { .toasts { right: 16px; left: 16px; width: auto; } }
  `
})
export class ToastsComponent {
  readonly toast = inject(ToastService);
}
