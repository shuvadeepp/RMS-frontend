import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from './icon.component';

interface SearchEntry {
  title: string;      // what the user searches for (the heading text on the screen)
  page: string;       // page name shown beside the suggestion
  path: string;       // route to open
  keywords?: string;  // extra words that should also match
}

// Every screen and its main sections. `title` is also used to scroll to the matching heading after the jump,
// so keep it identical to the heading text on the page.
const INDEX: SearchEntry[] = [
  { title: 'Home', page: 'Home', path: '/home', keywords: 'welcome dashboard' },
  { title: 'Projects that need people', page: 'Home', path: '/home' },
  { title: 'Recent matching runs', page: 'Home', path: '/home' },

  { title: 'Projects and their needs', page: 'Projects', path: '/projects', keywords: 'project list' },
  { title: 'All projects', page: 'Projects', path: '/projects' },
  { title: 'People needed', page: 'Projects', path: '/projects' },

  { title: 'Who is the right person for your project?', page: 'Find People (AI)', path: '/find-people', keywords: 'find people ai match requirement' },
  { title: '1. Tell us the need', page: 'Find People (AI)', path: '/find-people', keywords: 'skills requirement' },

  { title: 'Who knows what', page: 'People & Skills', path: '/people', keywords: 'people skills employees' },

  { title: 'Review and decide', page: 'Decisions', path: '/decisions', keywords: 'approve reject hold' },
  { title: 'Decision history', page: 'Decisions', path: '/decisions' },

  { title: 'Tagged People', page: 'Tagged People', path: '/tagged-people', keywords: 'ai search block release' },

  { title: 'Close the gaps', page: 'Skill Growth', path: '/skill-growth', keywords: 'skill growth learning' },

  { title: 'Learning catalog', page: 'Learning catalog', path: '/learning-catalog', keywords: 'courses training' },

  { title: 'How matching is going', page: 'Reports', path: '/reports', keywords: 'report' },
  { title: 'Matches by category', page: 'Reports', path: '/reports' },
  { title: 'Decisions by type', page: 'Reports', path: '/reports' },
  { title: 'Matching runs by status', page: 'Reports', path: '/reports' },
  { title: 'Skill gaps across the workforce', page: 'Reports', path: '/reports' },
  { title: 'Gaps by priority', page: 'Reports', path: '/reports' },
  { title: 'Most common gaps', page: 'Reports', path: '/reports' },
  { title: 'Download Excel', page: 'Reports', path: '/reports', keywords: 'export matches decisions' },
  { title: 'Activity log', page: 'Reports', path: '/reports', keywords: 'audit history' }
];

const HEADINGS = 'h1, h2, h3, .page-title, .section-title';
const MAX_RESULTS = 8;

// Navbar search: type part of a screen or section name, pick a suggestion, and jump to that page and section.
@Component({
  selector: 'app-global-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: {
    '(document:keydown)': 'onGlobalKey($event)',
    '(document:pointerdown)': 'onDocumentPointer($event)'
  },
  template: `
    <div class="gs" role="search">
      <app-icon class="gs-icon" name="search" [size]="18" />
      <input #box type="search" class="gs-input" placeholder="Search screens and sections  (Ctrl+K)"
             role="combobox" aria-label="Search screens and sections" aria-autocomplete="list"
             [attr.aria-expanded]="showList()" aria-controls="gs-list"
             [attr.aria-activedescendant]="showList() ? 'gs-opt-' + active() : null"
             autocomplete="off" [value]="query()"
             (input)="onInput(box.value)" (focus)="open.set(true)" (keydown)="onKey($event)">
      @if (showList()) {
        <ul class="gs-list" id="gs-list" role="listbox">
          @for (r of results(); track $index) {
            <li role="option" [id]="'gs-opt-' + $index" [class.active]="$index === active()"
                [attr.aria-selected]="$index === active()"
                (pointerenter)="active.set($index)" (pointerdown)="$event.preventDefault()" (click)="go(r)">
              <span class="gs-title">{{ r.title }}</span>
              <span class="gs-page">{{ r.page }}</span>
            </li>
          }
        </ul>
      } @else if (open() && query().trim()) {
        <div class="gs-list gs-empty" role="status">No screen or section matches "{{ query().trim() }}".</div>
      }
    </div>
  `,
  styles: `
    :host { display: block; width: 100%; max-width: 480px; }
    .gs { position: relative; }
    .gs-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; display: inline-flex; }
    .gs-input {
      width: 100%; height: 38px; padding: 0 14px 0 40px; border-radius: 999px;
      border: 1px solid var(--input-border); background: var(--card); color: var(--ink); font-size: 14px;
    }
    .gs-input:focus { outline: none; border-color: var(--primary); }
    .gs-list {
      position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 70;
      margin: 0; padding: 6px; list-style: none; max-height: 340px; overflow-y: auto;
      background: var(--card); border: 1px solid var(--border); border-radius: 14px;
      box-shadow: 0 12px 32px rgba(15, 27, 61, .16);
    }
    .gs-list li {
      display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
      padding: 9px 12px; border-radius: 8px; cursor: pointer; font-size: 14px;
    }
    .gs-list li.active { background: var(--primary-tint); }
    .gs-title { font-weight: 700; }
    .gs-page { color: var(--muted); font-size: 12px; white-space: nowrap; }
    .gs-empty { padding: 12px; color: var(--muted); font-size: 14px; }
  `
})
export class GlobalSearchComponent {
  private router = inject(Router);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private box = viewChild.required<ElementRef<HTMLInputElement>>('box');

  readonly query = signal('');
  readonly open = signal(false);
  readonly active = signal(0);

  readonly results = computed(() => {
    const terms = this.query().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return INDEX
      .map(e => {
        const title = e.title.toLowerCase();
        const hay = `${title} ${e.page.toLowerCase()} ${(e.keywords ?? '').toLowerCase()}`;
        if (!terms.every(t => hay.includes(t))) return null;
        // Title matches rank above page/keyword matches; matches at the start rank highest.
        const inTitle = terms.every(t => title.includes(t));
        const score = (inTitle ? 0 : 10) + (title.startsWith(terms[0]) ? 0 : 5);
        return { e, score };
      })
      .filter((x): x is { e: SearchEntry; score: number } => x !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_RESULTS)
      .map(x => x.e);
  });
  readonly showList = computed(() => this.open() && this.results().length > 0);

  onInput(value: string): void {
    this.query.set(value);
    this.active.set(0);
    this.open.set(true);
  }

  onKey(ev: KeyboardEvent): void {
    const n = this.results().length;
    if (ev.key === 'ArrowDown' && n) { this.active.set((this.active() + 1) % n); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp' && n) { this.active.set((this.active() - 1 + n) % n); ev.preventDefault(); }
    else if (ev.key === 'Enter' && this.showList()) { this.go(this.results()[this.active()]); ev.preventDefault(); }
    else if (ev.key === 'Escape') { this.open.set(false); this.box().nativeElement.blur(); }
  }

  onGlobalKey(ev: KeyboardEvent): void {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      this.box().nativeElement.focus();
      this.box().nativeElement.select();
    }
  }

  onDocumentPointer(ev: PointerEvent): void {
    if (!this.host.nativeElement.contains(ev.target as Node)) this.open.set(false);
  }

  go(entry: SearchEntry | undefined): void {
    if (!entry) return;
    this.open.set(false);
    this.query.set('');
    this.box().nativeElement.blur();
    const sameRoute = this.router.url.split(/[?#]/)[0] === entry.path;
    if (sameRoute) {
      this.scrollToHeading(entry.title);
    } else {
      this.router.navigateByUrl(entry.path).then(ok => { if (ok) this.scrollToHeading(entry.title); });
    }
  }

  // Sections load their data asynchronously, so retry for a couple of seconds until the heading is on screen.
  private scrollToHeading(title: string, attempt = 0): void {
    const wanted = title.trim().toLowerCase();
    const el = Array.from(document.querySelectorAll<HTMLElement>(HEADINGS))
      .find(h => (h.textContent ?? '').trim().toLowerCase().startsWith(wanted));
    if (el) {
      el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      // Strong, hard-to-miss flash: yellow fill + primary outline, pulsing for ~3.5 seconds, then fading out.
      const on = { backgroundColor: 'rgba(255, 214, 10, .55)', outline: '3px solid var(--primary)', outlineOffset: '4px', borderRadius: '8px' };
      const dim = { backgroundColor: 'rgba(255, 214, 10, .25)', outline: '3px solid var(--primary)', outlineOffset: '4px', borderRadius: '8px' };
      const off = { backgroundColor: 'rgba(255, 214, 10, 0)', outline: '3px solid transparent', outlineOffset: '4px', borderRadius: '8px' };
      el.animate([off, on, dim, on, dim, on, off], { duration: 3500, easing: 'ease-in-out' });
    } else if (attempt < 20) {
      setTimeout(() => this.scrollToHeading(title, attempt + 1), 100);
    }
  }
}
