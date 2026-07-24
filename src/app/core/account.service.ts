import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { BungieApiService } from './bungie-api.service';
import { BungieApiError, pickPrimaryMembership, usableMemberships } from './bungie';
import type { UserInfoCard } from './bungie';

const SELECTED_KEY = 'little-light:membership';

/** The signed-in player's Destiny accounts and which one the app is viewing. */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly auth = inject(AuthService);
  private readonly api = inject(BungieApiService);

  readonly memberships = signal<readonly UserInfoCard[]>([]);
  readonly selected = signal<UserInfoCard | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private inflight: Promise<void> | null = null;

  constructor() {
    effect(() => {
      if (this.auth.isSignedIn()) {
        void this.ensureLoaded();
      } else {
        this.memberships.set([]);
        this.selected.set(null);
        this.error.set(null);
        this.inflight = null;
      }
    });
  }

  ensureLoaded(): Promise<void> {
    this.inflight ??= this.load();
    return this.inflight;
  }

  select(membership: UserInfoCard): void {
    this.selected.set(membership);
    localStorage.setItem(SELECTED_KEY, membership.membershipId);
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await this.api.getCurrentUserMemberships();
      const usable = usableMemberships(response.destinyMemberships);
      this.memberships.set(usable);
      if (usable.length === 0) {
        this.error.set('No Destiny 2 accounts are linked to this Bungie.net profile.');
        return;
      }
      const storedId = localStorage.getItem(SELECTED_KEY);
      const stored = usable.find((m) => m.membershipId === storedId);
      this.selected.set(stored ?? pickPrimaryMembership(usable, response.primaryMembershipId));
    } catch (err) {
      if (err instanceof BungieApiError && err.status === 401) {
        this.auth.signOut();
        this.error.set('Your Bungie.net session expired — please sign in again.');
      } else {
        this.error.set(err instanceof Error ? err.message : 'Failed to load your accounts.');
      }
      this.inflight = null;
    } finally {
      this.loading.set(false);
    }
  }
}
