import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { BungieApiService } from '../../core/bungie-api.service';
import { ManifestService } from '../../core/manifest.service';
import { buildInventoryView } from '../../core/inventory';
import { BUNGIE_ROOT, BungieApiError, CLASS_NAMES, pickPrimaryMembership } from '../../core/bungie';
import type { DestinyCharacter, DestinyFullProfile } from '../../core/bungie';
import type { InventoryView } from '../../core/inventory';
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
      @if (view(); as v) {
        <div class="inv-workspace">
          <div class="inv-grid" [style.--char-count]="v.characters.length || 1">
            @for (c of v.characters; track c.characterId) {
              <header class="inv-char-header" [style.background-image]="emblemUrl(c.character)">
                <span class="inv-char-class">{{ classNames[c.character.classType] ?? '?' }}</span>
                <span class="inv-char-light">✦ {{ c.character.light }}</span>
              </header>
            }
            <header class="inv-vault-header">
              <h2>Vault</h2>
              <span class="inv-vault-count">{{ v.vaultTotal }}</span>
            </header>

            @for (row of v.rows; track row.hash) {
              @for (cell of row.perCharacter; track $index) {
                <div class="inv-cell">
                  <h3 class="inv-label">{{ row.label }}</h3>
                  <div class="inv-bucket-row">
                    <div class="inv-equipped">
                      @if (cell.equipped; as equipped) {
                        <app-item-tile [item]="equipped" />
                      } @else {
                        <div class="tile tile-empty"></div>
                      }
                    </div>
                    <div class="inv-stored">
                      @for (stored of cell.stored; track stored.instanceId ?? $index) {
                        <app-item-tile [item]="stored" />
                      }
                    </div>
                  </div>
                </div>
              }
              <div class="inv-cell inv-vault-cell">
                <h3 class="inv-label">
                  {{ row.label }} <span class="inv-count">{{ row.vault.length }}</span>
                </h3>
                <div class="vault-grid">
                  @for (stored of row.vault; track stored.instanceId ?? $index) {
                    <app-item-tile [item]="stored" />
                  }
                </div>
              </div>
            }

            @if (v.otherVault.length > 0) {
              @for (c of v.characters; track c.characterId) {
                <div class="inv-cell"></div>
              }
              <div class="inv-cell inv-vault-cell">
                <h3 class="inv-label">
                  Other <span class="inv-count">{{ v.otherVault.length }}</span>
                </h3>
                <div class="vault-grid">
                  @for (stored of v.otherVault; track stored.instanceId ?? $index) {
                    <app-item-tile [item]="stored" />
                  }
                </div>
              </div>
            }
          </div>
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
  protected readonly view = signal<InventoryView | null>(null);

  protected readonly downloadedMb = computed(() => {
    const state = this.manifest.state();
    return state.kind === 'downloading' ? state.receivedMb.toFixed(0) : '';
  });

  async ngOnInit(): Promise<void> {
    if (!this.auth.isSignedIn()) return;
    this.loading.set(true);
    try {
      const [defs, full] = await Promise.all([this.manifest.load(), this.loadProfile()]);
      this.view.set(buildInventoryView(full, defs));
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
