import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Blocks pages for users who are not logged in or whose token has run out.
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isExpired()) {
    authService.clearSession();
    return router.createUrlTree(['/login'], { queryParams: { expired: 1 } });
  }
  return authService.isLoggedIn() ? true : router.createUrlTree(['/login']);
};
