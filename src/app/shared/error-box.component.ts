import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ApiError } from '../core/error-message';
import { IconComponent } from './icon.component';

// Shows a backend error (error / detail / root_cause) with an optional Retry button.
@Component({
  selector: 'app-error-box',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="state state-error" role="alert">
      <div class="row">
        <app-icon name="alert" />
        <strong>{{ error().title }}</strong>
      </div>
      @if (error().detail) { <span>{{ error().detail }}</span> }
      @if (error().rootCause) {
        <details>
          <summary class="small">Technical details</summary>
          <code>{{ error().rootCause }}</code>
        </details>
      }
      @if (showRetry() && error().retryable) {
        <button type="button" class="btn btn-sm btn-danger" (click)="retry.emit()">
          <app-icon name="refresh" [size]="16" /> Retry
        </button>
      }
    </div>
  `
})
export class ErrorBoxComponent {
  readonly error = input.required<ApiError>();
  readonly showRetry = input<boolean>(true);
  readonly retry = output<void>();
}
