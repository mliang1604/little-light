import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { BungieApiService } from '../../core/bungie-api.service';
import { ManifestService } from '../../core/manifest.service';
import { buildCharacterColumns, buildVaultGroups } from '../../core/inventory';
import { BUNGIE_ROOT, BungieApiError, CLASS_NAMES, pickPrimaryMembership } from '../../core/bungie';
import type { DestinyCharacter, DestinyFullProfile } from '../../core/bungie';
import type { CharacterColumn, VaultGroup } from '../../core/inventory';
import { ItemTile } from './item-tile';

@Component({
  selector: 'app-inventory-page',
  imports: [ItemTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!auth.isSignedIn()) {
      <section class="signin-card">
        <h2>Inventory</h2>
        <p>Sign in with Bungie.net to browse your characters and vault.</p>
        @if (auth.isConfigured) {
          <button type="button" (click)="auth.beginLogin()">Sign in with Bungie.net</button>
        } @else {
          <p class="error">
            OAuth is not configured — set <code>bungieClientId</code> in
            <code>src/environments/</code>.
          </p>
        }
      </section>
    } @else {
      @switch (manifest.state().kind) {
        @case ('checking') {
          <p class="lede">Checking the item database…</p>
        }
        @case ('downloading') {
          <p class="lede">
            Downloading the item database — {{ downloadedMb() }} MB so far (one-time per game
            update)…
          </p>
        }
        @case ('processing') {
          <p class="lede">Processing the item database…</p>
        }
      }
      @if (loading() && manifest.state().kind === 'ready') {
        <p class="lede">Loading your inventory…</p>
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      @if (columns(); as cols) {
        <div class="inv-layout">
          @for (col of cols; track col.characterId) {
            <section class="inv-char">
              <header class="inv-char-header" [style.background-image]="emblemUrl(col.character)">
                <span class="inv-char-class">{{ classNames[col.character.classType] ?? '?' }}</span>
                <span class="inv-char-light">✦ {{ col.character.light }}</span>
              </header>
              @for (bucket of col.buckets; track bucket.hash) {
                <div class="inv-bucket">
                  <h3 class="inv-label">{{ bucket.label }}</h3>
                  <div class="inv-bucket-row">
                    <div class="inv-equipped">
                      @if (bucket.equipped; as equipped) {
                        <app-item-tile [item]="equipped" />
                      } @else {
                        <div class="tile tile-empty"></div>
                      }
                    </div>
                    <div class="inv-stored">
                      @for (stored of bucket.stored; track stored.instanceId ?? $index) {
                        <app-item-tile [item]="stored" />
                      }
                    </div>
                  </div>
                </div>
              }
            </section>
          }
          <section class="inv-vault">
            <header class="inv-vault-header">
              <h2>Vault</h2>
              <span class="inv-vault-count">{{ vaultCount() }}</span>
            </header>
            @for (group of vault() ?? []; track group.label) {
              <h3 class="inv-label">
                {{ group.label }} <span class="inv-count">{{ group.items.length }}</span>
              </h3>
              <div class="vault-grid">
                @for (stored of group.items; track stored.instanceId ?? $index) {
                  <app-item-tile [item]="stored" />
                }
              </div>
            }
          </section>
        </div>
      }
    }
  `,
})
export class InventoryPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly manifest = inject(ManifestService);
  private readonly api = inject(BungieApiService);

  protected readonly classNames = CLASS_NAMES;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly columns = signal<readonly CharacterColumn[] | null>(null);
  protected readonly vault = signal<readonly VaultGroup[] | null>(null);

  protected readonly downloadedMb = computed(() => {
    const state = this.manifest.state();
    return state.kind === 'downloading' ? state.receivedMb.toFixed(0) : '';
  });

  protected readonly vaultCount = computed(
    () => this.vault()?.reduce((sum, group) => sum + group.items.length, 0) ?? 0,
  );

  async ngOnInit(): Promise<void> {
    if (!this.auth.isSignedIn()) return;
    this.loading.set(true);
    try {
      const [defs, full] = await Promise.all([this.manifest.load(), this.loadProfile()]);
      this.columns.set(buildCharacterColumns(full, defs));
      this.vault.set(buildVaultGroups(full, defs));
    } catch (err) {
      if (err instanceof BungieApiError && err.status === 401) {
        this.auth.signOut();
        this.error.set('Your Bungie.net session expired — please sign in again.');
      } else if (this.manifest.state().kind !== 'error') {
        this.error.set(err instanceof Error ? err.message : 'Something went wrong.');
      } else {
        this.error.set(this.manifestErrorMessage());
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected emblemUrl(character: DestinyCharacter): string {
    return `url(${BUNGIE_ROOT}${character.emblemBackgroundPath})`;
  }

  private manifestErrorMessage(): string {
    const state = this.manifest.state();
    return state.kind === 'error' ? state.message : 'Failed to load the item database.';
  }

  private async loadProfile(): Promise<DestinyFullProfile> {
    const memberships = await this.api.getCurrentUserMemberships();
    const primary = pickPrimaryMembership(
      memberships.destinyMemberships,
      memberships.primaryMembershipId,
    );
    if (!primary) {
      throw new BungieApiError('No Destiny 2 accounts are linked to this Bungie.net profile.');
    }
    return this.api.getFullProfile(primary.membershipType, primary.membershipId);
  }
}
