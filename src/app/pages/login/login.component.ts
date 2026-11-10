import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { getErrorMessage } from '../../core/error-message';
import { AuthService } from '../../services/auth.service';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-login',
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly username = signal('');
  readonly password = signal('');
  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly expired = inject(ActivatedRoute).snapshot.queryParamMap.has('expired');

  readonly reasons = [
    'Clear reasons for every suggestion.',
    'Skill gaps and learning plans included.',
    'Nobody is allocated without your approval.'
  ];

  submit(): void {
    if (!this.username().trim() || !this.password() || this.loading()) {
      this.error.set('Enter your username and password.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);

    this.auth.login({ username: this.username().trim(), password: this.password() }).subscribe({
      next: () => this.router.navigate(['/home']),
      error: (err: HttpErrorResponse) => {
        this.error.set(err.status === 401 ? 'Wrong username or password.' : getErrorMessage(err));
        this.loading.set(false);
      }
    });
  }
}
