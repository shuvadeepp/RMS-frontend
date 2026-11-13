import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../core/theme.service';
import { ViewModeService } from '../core/view-mode.service';
import { GlobalSearchComponent } from '../shared/global-search.component';
import { IconComponent, IconName } from '../shared/icon.component';
import { ToastsComponent } from '../shared/toasts.component';
import { humanise, initials } from '../shared/labels';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  roles?: string[]; // shown only to these roles; all roles when omitted
}

interface NavSection {
  title: string;
  items: NavItem[];
}

function isHomeUrl(url: string): boolean {
  return /^\/home(?:[/?#]|$)/.test(url) || url === '/';
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, ToastsComponent, GlobalSearchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  private auth = inject(AuthService);
  readonly theme = inject(ThemeService);

  // Every item is shown to every role: the backend does not enforce roles yet.
  readonly homeItem: NavItem = { path: '/home', label: 'Dashboard', icon: 'home' };
  readonly sections: NavSection[] = [
    {
      title: 'Manage Master',
      items: [
        { path: '/projects', label: 'Projects', icon: 'folder' },
        { path: '/people', label: 'People & Skills', icon: 'users' }
      ]
    },
    {
      title: 'Manage Talents',
      items: [
        { path: '/find-people', label: 'Find People (AI)', icon: 'sparkle' },
        { path: '/decisions', label: 'Decisions', icon: 'check' },
        { path: '/tagged-people', label: 'Tagged People', icon: 'tag' },
        { path: '/skill-growth', label: 'Skill Growth', icon: 'trending' }
      ]
    },
    {
      title: 'Manage Reports',
      items: [{ path: '/reports', label: 'Reports', icon: 'chart' }]
    }
  ];
  readonly visibleSections = computed(() =>
    this.sections
      .map(s => ({ ...s, items: s.items.filter(i => !i.roles || this.auth.hasAnyRole(...i.roles)) }))
      .filter(s => s.items.length > 0));

  readonly viewMode = inject(ViewModeService);
  private router = inject(Router);
  // The Home view switch only applies on the Home screen.
  readonly onHome = signal(isHomeUrl(this.router.url));

  readonly menuOpen = signal(false);
  readonly user = this.auth.user;
  readonly userInitials = computed(() => initials(this.user()?.fullName ?? this.user()?.username));
  readonly roleLabel = computed(() => humanise(this.user()?.role));

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(e => {
        this.menuOpen.set(false);
        this.onHome.set(isHomeUrl(e.urlAfterRedirects));
      });
  }

  signOut(): void {
    this.auth.logout();
  }
}


