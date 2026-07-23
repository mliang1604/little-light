import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-callback-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
      <p><a routerLink="/">Back to search</a></p>
    } @else {
      <p class="lede">Completing sign-in…</p>
    }
  `,
})
export class CallbackPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const returnedState = params.get('state');
    const expectedState = this.auth.consumePendingState();

    if (!code) {
      this.error.set('Bungie.net did not return an authorization code.');
      return;
    }
    if (!expectedState || returnedState !== expectedState) {
      this.error.set('Sign-in state mismatch — please try signing in again.');
      return;
    }
    try {
      await this.auth.exchangeCode(code);
      await this.router.navigateByUrl('/me', { replaceUrl: true });
    } catch {
      this.error.set('Could not complete sign-in — please try again.');
    }
  }
}
