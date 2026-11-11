import { Injectable, signal } from '@angular/core';

export type HomeView = 'new' | 'classic';

const STORAGE_KEY = 'rms_home_view';

// Which Home dashboard is shown. The choice is saved in this browser; if storage is blocked it only lasts for the session.
@Injectable({ providedIn: 'root' })
export class ViewModeService {
  private readonly _homeView = signal<HomeView>(this.read());
  readonly homeView = this._homeView.asReadonly();

  setHomeView(view: HomeView): void {
    this._homeView.set(view);
    try { localStorage.setItem(STORAGE_KEY, view); } catch { /* storage blocked: keep in-memory choice */ }
  }

  private read(): HomeView {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'classic' ? 'classic' : 'new';
    } catch {
      return 'new';
    }
  }
}
