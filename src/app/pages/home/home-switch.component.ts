import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ViewModeService } from '../../core/view-mode.service';
import { HomeV2Component } from '../home-v2/home-v2.component';
import { HomeComponent } from './home.component';

// Home route: shows the new Command center or the existing (Classic) Home, without a reload or route change.
@Component({
  selector: 'app-home-switch',
  imports: [HomeV2Component, HomeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view.homeView() === 'new') {
      <app-home-v2 />
    } @else {
      <app-home />
    }
  `
})
export class HomeSwitchComponent {
  readonly view = inject(ViewModeService);
}
