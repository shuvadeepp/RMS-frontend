import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EmployeeView } from './employee-view';
import { availabilityOf, initials } from './labels';

@Component({
  selector: 'app-employee-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = employee();
    <article class="card person">
      <div class="row">
        <span class="avatar" aria-hidden="true">{{ avatar() }}</span>
        <div class="list-main">
          <h3 class="list-title">{{ e.name }}</h3>
          <p class="muted small">{{ e.code }}@if (e.designation) { · {{ e.designation }} }</p>
        </div>
      </div>
      @if (meta()) { <p class="small">{{ meta() }}</p> }
      <div class="row">
        <span class="pill" [class]="availability().css">{{ availability().label }}</span>
        @if (e.capacity !== null && e.availability?.toUpperCase() !== 'PARTIALLY_AVAILABLE') { <span class="muted small">{{ e.capacity }}% free</span> }
      </div>
      <div class="chip-list">
        @for (s of e.skills; track s.name) { <span class="chip">{{ s.name }} · {{ s.level }}/5</span> }
        @empty { <span class="muted small">No skills recorded</span> }
      </div>
    </article>
  `,
  styles: `
    :host { display: block; }
    .person { display: flex; flex-direction: column; gap: 10px; height: 100%; }
    .person h3 { font-size: 16px; }
  `
})
export class EmployeeCardComponent {
  readonly employee = input.required<EmployeeView>();
  readonly avatar = computed(() => initials(this.employee().name));
  readonly availability = computed(() => availabilityOf(this.employee().availability, this.employee().capacity, this.employee().availableFrom));
  readonly meta = computed(() => {
    const e = this.employee();
    return [e.department, e.experience !== null ? `${e.experience} years` : ''].filter(Boolean).join(' · ');
  });
}
