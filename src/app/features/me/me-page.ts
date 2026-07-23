import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { BungieApiService } from '../../core/bungie-api.service';
import { BungieApiError, pickPrimaryMembership } from '../../core/bungie';
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
    } @else if (loading()) {
      <p class="lede">Loading your Guardian…</p>
    } @else if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    } @else if (result(); as r) {
      <app-profile-view [player]="r.player" [profile]="r.profile" />
    }
  `,
})
export class MePage implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(BungieApiService);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<LoadedProfile | null>(null);

  async ngOnInit(): Promise<void> {
    if (this.auth.isSignedIn()) await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const memberships = await this.api.getCurrentUserMemberships();
      const primary = pickPrimaryMembership(
        memberships.destinyMemberships,
        memberships.primaryMembershipId,
      );
      if (!primary) {
        this.error.set('No Destiny 2 accounts are linked to this Bungie.net profile.');
        return;
      }
      const profile = await this.api.getProfile(primary.membershipType, primary.membershipId);
      this.result.set({ player: primary, profile });
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
