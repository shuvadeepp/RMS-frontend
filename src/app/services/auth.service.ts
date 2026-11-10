import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { ApiService } from '../core/api.service';
import { LoginRequest, LoginResponse, SessionUser } from '../models/auth.model';

const TOKEN_KEY = 'tm_token';
const USER_KEY = 'tm_user';
const EXPIRES_KEY = 'tm_expires_at';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  private tokenSignal = signal<string | null>(sessionStorage.getItem(TOKEN_KEY));
  private expiresAt = signal<number>(Number(sessionStorage.getItem(EXPIRES_KEY) ?? 0));
  readonly user = signal<SessionUser | null>(readUser());

  readonly isLoggedIn = computed(() => this.tokenSignal() !== null);
  // Role from the login response; "ROLE_ADMIN" is accepted too.
  readonly isAdmin = computed(() => (this.user()?.role ?? '').toUpperCase().replace(/^ROLE_/, '') === 'ADMIN');

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('/auth/login', credentials).pipe(
      tap(response => {
        const user: SessionUser = {
          username: response.username,
          fullName: response.fullName,
          role: response.role
        };
        const expiresAt = Date.now() + (response.expiresInMs || 3600000);
        sessionStorage.setItem(TOKEN_KEY, response.token);
        sessionStorage.setItem(USER_KEY, JSON.stringify(user));
        sessionStorage.setItem(EXPIRES_KEY, String(expiresAt));
        this.tokenSignal.set(response.token);
        this.expiresAt.set(expiresAt);
        this.user.set(user);
      })
    );
  }

  getToken(): string | null {
    return this.tokenSignal();
  }

  isExpired(): boolean {
    return this.tokenSignal() !== null && this.expiresAt() > 0 && Date.now() >= this.expiresAt();
  }

  clearSession(): void {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(EXPIRES_KEY);
    this.tokenSignal.set(null);
    this.expiresAt.set(0);
    this.user.set(null);
  }

  logout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  // Used on 401 from /api/** and when the 1-hour token runs out.
  expireSession(): void {
    this.clearSession();
    this.router.navigate(['/login'], { queryParams: { expired: 1 } });
  }
}

function readUser(): SessionUser | null {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}
