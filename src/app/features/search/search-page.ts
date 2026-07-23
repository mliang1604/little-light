import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BungieApiService } from '../../core/bungie-api.service';
import type { DestinyProfile, UserInfoCard } from '../../core/bungie';
import { ProfileView } from '../profile/profile-view';

interface SearchResult {
  player: UserInfoCard;
  profile: DestinyProfile;
}

@Component({
  selector: 'app-search-page',
  imports: [FormsModule, ProfileView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="lede">Look up any Guardian by full Bungie Name.</p>
    <form class="search" (ngSubmit)="search()">
      <input
        name="query"
        [(ngModel)]="query"
        placeholder="Guardian#1234"
        aria-label="Bungie Name"
        autocomplete="off"
        spellcheck="false"
      />
      <button type="submit" [disabled]="loading() || !query().trim()">
        {{ loading() ? 'Searching…' : 'Search' }}
      </button>
    </form>
    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }
    @if (result(); as r) {
      <app-profile-view [player]="r.player" [profile]="r.profile" />
    }
  `,
})
export class SearchPage {
  private readonly api = inject(BungieApiService);

  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<SearchResult | null>(null);

  protected async search(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const player = await this.api.searchPlayer(this.query());
      if (!player) {
        this.result.set(null);
        this.error.set('No player found with that Bungie Name.');
        return;
      }
      const profile = await this.api.getProfile(player.membershipType, player.membershipId);
      this.result.set({ player, profile });
    } catch (err) {
      this.result.set(null);
      this.error.set(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      this.loading.set(false);
    }
  }
}
