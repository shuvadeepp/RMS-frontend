import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../core/theme.service';
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
  readonly nav: NavItem[] = [
    { path: '/home', label: 'Home', icon: 'home' },
    { path: '/projects', label: 'Projects', icon: 'folder' },
    { path: '/find-people', label: 'Find People (AI)', icon: 'sparkle' },
    { path: '/people', label: 'People & Skills', icon: 'users' },
    { path: '/decisions', label: 'Decisions', icon: 'check' },
    { path: '/tagged-people', label: 'Tagged People', icon: 'tag' },
    { path: '/skill-growth', label: 'Skill Growth', icon: 'trending' },
    { path: '/reports', label: 'Reports', icon: 'chart' }
  ];
  readonly visibleNav = computed(() => this.nav.filter(i => !i.roles || this.auth.hasAnyRole(...i.roles)));

  readonly menuOpen = signal(false);
  readonly user = this.auth.user;
  readonly userInitials = computed(() => initials(this.user()?.fullName ?? this.user()?.username));
  readonly roleLabel = computed(() => humanise(this.user()?.role));

  constructor() {
    inject(Router).events
      .pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => this.menuOpen.set(false));
  }

  signOut(): void {
    this.auth.logout();
  }
}


