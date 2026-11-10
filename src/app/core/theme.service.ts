import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'tm-theme';

// Light / dark theme. The choice is saved in this browser; until the user picks one, the OS setting is used.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);

  private readonly _theme = signal<Theme>(this.initial());
  readonly theme = this._theme.asReadonly();
  readonly isDark = computed(() => this._theme() === 'dark');

  constructor() {
    effect(() => {
      const t = this._theme();
      this.doc.documentElement.setAttribute('data-theme', t);
      this.doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0B1330' : '#F4F6FB');
    });

    // Follow the OS while the user has not chosen explicitly.
    const mq = this.doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener('change', e => {
      if (!this.stored()) this._theme.set(e.matches ? 'dark' : 'light');
    });
  }

  toggle(): void {
    const next: Theme = this._theme() === 'dark' ? 'light' : 'dark';
    this._theme.set(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage blocked: keep in-memory choice */ }
  }

  private stored(): Theme | null {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'dark' || v === 'light' ? v : null;
    } catch {
      return null;
    }
  }

  private initial(): Theme {
    return this.stored()
      ?? (this.doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
}
