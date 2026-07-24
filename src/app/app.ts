import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { environment } from '../environments/environment';
import { AccountService } from './core/account.service';
import { AuthService } from './core/auth.service';
import { PLATFORM_NAMES } from './core/bungie';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly account = inject(AccountService);
  protected readonly platformNames = PLATFORM_NAMES;
  protected readonly apiConfigured = environment.bungieApiKey !== '';

  protected onAccountChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const membership = this.account.memberships().find((m) => m.membershipId === value);
    if (membership) this.account.select(membership);
  }
}
