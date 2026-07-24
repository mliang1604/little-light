import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { AccountService } from '../../core/account.service';
import { AuthService } from '../../core/auth.service';
import { BungieApiService } from '../../core/bungie-api.service';
import { BungieApiError } from '../../core/bungie';
import type { DestinyProfile, UserInfoCard } from '../../core/bungie';
import { ProfileView } from '../profile/profile-view';

interface LoadedProfile {
  player: UserInfoCard;
  profile: DestinyProfile;
}

@Component({
  selector: 'app-me-page',
  imports: [ProfileView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!auth.isSignedIn()) {
      <section class="signin-card">
        <h2>Your Guardian</h2>
        <p>Sign in with Bungie.net to see your own characters, including private profiles.</p>
        @if (auth.isConfigured) {
          <button type="button" (click)="auth.beginLogin()">Sign in with Bungie.net</button>
        } @else {
          <p class="error">
            OAuth is not configured — set <code>bungieClientId</code> in
            <code>src/environments/</code>.
          </p>
        }
      </section>
    } @else if (busy()) {
      <p class="lede">Loading your Guardian…</p>
    } @else if (displayError(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    } @else if (result(); as r) {
      <app-profile-view [player]="r.player" [profile]="r.profile" />
    }
  `,
})
export class MePage {
  protected readonly auth = inject(AuthService);
  protected readonly account = inject(AccountService);
  private readonly api = inject(BungieApiService);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<LoadedProfile | null>(null);

  protected readonly busy = computed(() => this.loading() || this.account.loading());
  protected readonly displayError = computed(() => this.error() ?? this.account.error());

  private loadedId: string | null = null;

  constructor() {
    effect(() => {
      if (!this.auth.isSignedIn()) return;
      const membership = this.account.selected();
      if (!membership) {
        this.loadedId = null;
        return;
      }
      if (membership.membershipId === this.loadedId) return;
      this.loadedId = membership.membershipId;
      untracked(() => void this.load(membership));
    });
  }

  private async load(membership: UserInfoCard): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);
    try {
      const profile = await this.api.getProfile(membership.membershipType, membership.membershipId);
      this.result.set({ player: membership, profile });
    } catch (err) {
      if (err instanceof BungieApiError && err.status === 401) {
        this.auth.signOut();
        this.error.set('Your Bungie.net session expired — please sign in again.');
      } else {
        this.error.set(err instanceof Error ? err.message : 'Something went wrong.');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
