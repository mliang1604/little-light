import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { AccountService } from '../../core/account.service';
import { AuthService } from '../../core/auth.service';
import { BungieApiService } from '../../core/bungie-api.service';
import { ManifestService } from '../../core/manifest.service';
import { RollsService } from '../../core/rolls.service';
import {
  ENGRAM_CAPACITY,
  POSTMASTER_CAPACITY,
  buildInventoryView,
  buildItemDetail,
} from '../../core/inventory';
import { BUNGIE_ROOT, BungieApiError, CLASS_NAMES } from '../../core/bungie';
import type {
  DestinyCharacter,
  DestinyFullProfile,
  SocketCategoryInfo,
  UserInfoCard,
} from '../../core/bungie';
import type { InventoryView, ItemDetailView, ItemView } from '../../core/inventory';
import type { LoadedDefs } from '../../core/manifest.service';
import type { RollAssessment } from '../../core/rolls';
import { ItemDetail } from './item-detail';
import type { PopoverPosition } from './item-detail';
import { ItemTile } from './item-tile';
import type { ItemSelection } from './item-tile';
import { EMPTY_FILTERS, InventoryFilters, isEmptyFilter, matchesFilters } from './inventory-filters';
import type { FilterFacets, InventoryFilterState } from './inventory-filters';

/** Keep in sync with the .detail-panel width in styles.css. */
const POPOVER_WIDTH = 340;
const POPOVER_MARGIN = 8;

const TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];

interface FilteredInventory {
  readonly view: InventoryView;
  readonly shown: number;
  readonly total: number;
  readonly active: boolean;
}

@Component({
  selector: 'app-inventory-page',
  imports: [ItemTile, ItemDetail, InventoryFilters],
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
      @if (busy() && manifest.state().kind !== 'downloading') {
        <p class="lede">Loading your inventory…</p>
      }
      @if (displayError(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      @if (filtered(); as f) {
        <app-inventory-filters
          [(state)]="filters"
          [facets]="facets()"
          [shown]="f.shown"
          [total]="f.total"
        />
        <div class="inv-workspace">
          <div class="inv-grid" [style.--char-count]="f.view.characters.length || 1">
            @for (c of f.view.characters; track c.characterId) {
              <header class="inv-char-header" [style.background-image]="emblemUrl(c.character)">
                <span class="inv-char-class">{{ classNames[c.character.classType] ?? '?' }}</span>
                <span class="inv-char-light">✦ {{ c.character.light }}</span>
              </header>
            }
            <header class="inv-vault-header">
              <h2>Vault</h2>
              <span class="inv-vault-count">{{ f.view.vaultTotal }}</span>
            </header>

            @for (pm of f.view.postmaster; track $index) {
              <div class="inv-cell">
                <h3 class="inv-label">
                  Postmaster
                  <span class="inv-count">{{ pm.lostItems.length }}/{{ postmasterCapacity }}</span>
                </h3>
                <div class="engram-row">
                  @for (slot of engramSlots; track slot) {
                    @if (pm.engrams[slot]; as engram) {
                      <span
                        class="engram"
                        [title]="engram.name"
                        [style.background-image]="
                          engram.icon ? 'url(' + root + engram.icon + ')' : ''
                        "
                      ></span>
                    } @else {
                      <span class="engram engram-empty"></span>
                    }
                  }
                </div>
                <div class="postmaster-grid">
                  @for (lost of pm.lostItems; track lost.instanceId ?? $index) {
                    <app-item-tile
                      [item]="lost"
                      [roll]="rollOf(lost)"
                      (selected)="openDetail($event)"
                    />
                  }
                </div>
              </div>
            }
            <div class="inv-cell inv-vault-cell"></div>

            @for (row of f.view.rows; track row.hash) {
              @for (cell of row.perCharacter; track $index) {
                <div class="inv-cell">
                  <h3 class="inv-label">{{ row.label }}</h3>
                  <div class="inv-bucket-row">
                    <div class="inv-equipped">
                      @if (cell.equipped; as equipped) {
                        <app-item-tile
                          [item]="equipped"
                          [roll]="rollOf(equipped)"
                          (selected)="openDetail($event)"
                        />
                      } @else {
                        <div class="tile tile-empty"></div>
                      }
                    </div>
                    <div class="inv-stored">
                      @for (stored of cell.stored; track stored.instanceId ?? $index) {
                        <app-item-tile
                          [item]="stored"
                          [roll]="rollOf(stored)"
                          (selected)="openDetail($event)"
                        />
                      }
                    </div>
                  </div>
                </div>
              }
              <div class="inv-cell inv-vault-cell">
                @if (row.vault.length > 0 || !f.active) {
                  <h3 class="inv-label">
                    {{ row.label }} <span class="inv-count">{{ row.vault.length }}</span>
                  </h3>
                  <div class="vault-grid">
                    @for (stored of row.vault; track stored.instanceId ?? $index) {
                      <app-item-tile
                        [item]="stored"
                        [roll]="rollOf(stored)"
                        (selected)="openDetail($event)"
                      />
                    }
                  </div>
                }
              </div>
            }

            @if (f.view.otherVault.length > 0) {
              @for (c of f.view.characters; track c.characterId) {
                <div class="inv-cell"></div>
              }
              <div class="inv-cell inv-vault-cell">
                <h3 class="inv-label">
                  Other <span class="inv-count">{{ f.view.otherVault.length }}</span>
                </h3>
                <div class="vault-grid">
                  @for (stored of f.view.otherVault; track stored.instanceId ?? $index) {
                    <app-item-tile
                      [item]="stored"
                      [roll]="rollOf(stored)"
                      (selected)="openDetail($event)"
                    />
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }
      @if (selected(); as s) {
        <app-item-detail
          [detail]="s.detail"
          [position]="s.position"
          [roll]="s.roll"
          (closed)="selected.set(null)"
        />
      }
    }
  `,
})
export class InventoryPage {
  protected readonly auth = inject(AuthService);
  protected readonly account = inject(AccountService);
  protected readonly manifest = inject(ManifestService);
  private readonly api = inject(BungieApiService);
  private readonly rolls = inject(RollsService);

  protected readonly classNames = CLASS_NAMES;
  protected readonly root = BUNGIE_ROOT;
  protected readonly postmasterCapacity = POSTMASTER_CAPACITY;
  protected readonly engramSlots = Array.from({ length: ENGRAM_CAPACITY }, (_, i) => i);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly view = signal<InventoryView | null>(null);
  protected readonly filters = signal<InventoryFilterState>(EMPTY_FILTERS);
  protected readonly selected = signal<{
    detail: ItemDetailView;
    position: PopoverPosition;
    roll: RollAssessment | null;
  } | null>(null);

  private defs: LoadedDefs | null = null;
  private profileData: DestinyFullProfile | null = null;
  private loadedId: string | null = null;

  protected readonly busy = computed(() => this.loading() || this.account.loading());
  protected readonly displayError = computed(() => this.error() ?? this.account.error());

  protected readonly downloadedMb = computed(() => {
    const state = this.manifest.state();
    return state.kind === 'downloading' ? state.receivedMb.toFixed(0) : '';
  });

  protected readonly facets = computed<FilterFacets>(() => {
    this.rolls.state();
    const analysis = this.rolls.analysis;
    if (!analysis) return { tiers: [], types: [], sources: [] };
    const tiers = TIER_ORDER.filter((tier) => analysis.weapons.some((w) => w.tier === tier));
    const types = [...new Set(analysis.weapons.map((w) => w.type))];
    const sources = [
      ...new Set(analysis.weapons.map((w) => w.source).filter((s): s is string => !!s)),
    ].sort((a, b) => a.localeCompare(b));
    return { tiers, types, sources };
  });

  protected readonly filtered = computed<FilteredInventory | null>(() => {
    const view = this.view();
    if (!view) return null;
    this.rolls.state();
    const state = this.filters();
    const active = !isEmptyFilter(state);
    let total = 0;
    let shown = 0;
    const keep = (item: ItemView): boolean => {
      total++;
      const ok = !active || matchesFilters(item, this.rolls.assess(item), state);
      if (ok) shown++;
      return ok;
    };
    const rows = view.rows.map((row) => ({
      ...row,
      perCharacter: row.perCharacter.map((cell) => ({
        equipped: cell.equipped && keep(cell.equipped) ? cell.equipped : undefined,
        stored: cell.stored.filter(keep),
      })),
      vault: row.vault.filter(keep),
    }));
    const postmaster = view.postmaster.map((pm) => ({
      engrams: pm.engrams,
      lostItems: pm.lostItems.filter(keep),
    }));
    const otherVault = view.otherVault.filter(keep);
    return { view: { ...view, rows, postmaster, otherVault }, shown, total, active };
  });

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

  protected rollOf(item: ItemView): RollAssessment | null {
    this.rolls.state();
    return this.rolls.assess(item);
  }

  protected async openDetail(selection: ItemSelection): Promise<void> {
    const defs = this.defs;
    const profileData = this.profileData;
    if (!defs || !profileData) return;
    const { item, anchor } = selection;
    let categories: readonly SocketCategoryInfo[] = [];
    if (item.instanceId) {
      try {
        categories = (await this.api.getItemExtras(item.itemHash)).socketCategories;
      } catch {
        // Without the socket layout, every plug falls back to the mods list.
      }
    }
    this.selected.set({
      detail: buildItemDetail(
        item,
        profileData,
        defs.items,
        defs.statNames,
        categories,
        defs.socketCategoryNames,
      ),
      position: popoverPosition(anchor),
      roll: this.rolls.assess(item),
    });
  }

  protected emblemUrl(character: DestinyCharacter): string {
    return `url(${BUNGIE_ROOT}${character.emblemBackgroundPath})`;
  }

  private async load(membership: UserInfoCard): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.view.set(null);
    this.selected.set(null);
    void this.rolls.load().catch(() => {
      // Sheet data is an enhancement; the inventory still works without it.
    });
    try {
      const [defs, full] = await Promise.all([
        this.manifest.load(),
        this.api.getFullProfile(membership.membershipType, membership.membershipId),
      ]);
      this.defs = defs;
      this.profileData = full;
      this.view.set(buildInventoryView(full, defs.items));
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

  private manifestErrorMessage(): string {
    const state = this.manifest.state();
    return state.kind === 'error' ? state.message : 'Failed to load the item database.';
  }
}

/** Prefer the tile's right side; flip left when cramped, clamp to the viewport. */
function popoverPosition(anchor: DOMRect): PopoverPosition {
  let left = anchor.right + POPOVER_MARGIN;
  if (left + POPOVER_WIDTH + POPOVER_MARGIN > window.innerWidth) {
    left = anchor.left - POPOVER_WIDTH - POPOVER_MARGIN;
  }
  left = Math.max(
    POPOVER_MARGIN,
    Math.min(left, window.innerWidth - POPOVER_WIDTH - POPOVER_MARGIN),
  );
  const top = Math.max(
    POPOVER_MARGIN,
    Math.min(anchor.top, window.innerHeight - 360),
  );
  return { left, top, maxHeight: window.innerHeight - top - POPOVER_MARGIN };
}
