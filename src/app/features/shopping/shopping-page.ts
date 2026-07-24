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
import { toItemView } from '../../core/inventory';
import { evaluateRoll, normalizeName, shoppingWeapon } from '../../core/rolls';
import { BungieApiError } from '../../core/bungie';
import type { DestinyItemComponent, UserInfoCard } from '../../core/bungie';
import type { ItemView } from '../../core/inventory';
import type { SheetShoppingItem } from '../../core/rolls';

interface ShoppingRow {
  readonly item: SheetShoppingItem;
  readonly owned: boolean;
  readonly satisfied: boolean;
  readonly ownedAlternatives: readonly string[];
}

interface ShoppingGroup {
  readonly priority: string;
  readonly rows: readonly ShoppingRow[];
}

const PRIORITY_ORDER = ['high', 'medium', 'low'];

type OwnedIndex = ReadonlyMap<string, readonly ItemView[]>;

@Component({
  selector: 'app-shopping-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="shop-title">Shopping List</h2>
    <p class="lede">
      The Endgame Analysis farm list.
      @if (!auth.isSignedIn()) {
        Sign in to see what you already own.
      } @else {
        ✔ owned · ★ a roll with the wanted perks is already in your inventory.
      }
    </p>

    @if (manifest.state().kind === 'downloading') {
      <p class="lede">Downloading the item database — one-time per game update…</p>
    }
    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    @for (group of groups(); track group.priority) {
      <section class="shop-group">
        <h3 class="inv-label">
          {{ group.priority }} priority <span class="inv-count">{{ group.rows.length }}</span>
        </h3>
        <div class="shop-rows">
          @for (row of group.rows; track row.item.name + row.item.role) {
            <div class="shop-row" [class.shop-row-owned]="row.owned">
              <div class="shop-main">
                <span class="shop-name">
                  {{ row.item.name }}
                  @if (row.satisfied) {
                    <span class="shop-star" title="You already own a roll with the wanted perks"
                      >★</span
                    >
                  } @else if (row.owned) {
                    <span class="shop-check" title="Owned">✔</span>
                  }
                </span>
                <span class="shop-role">{{ row.item.role }}</span>
              </div>
              <div class="shop-source">{{ row.item.source }}</div>
              @if (row.item.col1.length > 0 || row.item.col2.length > 0) {
                <div class="shop-perks">
                  @if (row.item.col1.length > 0) {
                    <span class="shop-col"><em>Col 1:</em> {{ row.item.col1.join(' / ') }}</span>
                  }
                  @if (row.item.col2.length > 0) {
                    <span class="shop-col"><em>Col 2:</em> {{ row.item.col2.join(' / ') }}</span>
                  }
                </div>
              }
              @if (row.item.alternatives.length > 0) {
                <div class="shop-alts">
                  Alternatives:
                  @for (alt of row.item.alternatives; track alt) {
                    <span class="shop-alt" [class.shop-alt-owned]="row.ownedAlternatives.includes(alt)"
                      >{{ alt }}@if (row.ownedAlternatives.includes(alt)) {
                        <span> ✔</span>
                      }</span
                    >
                  }
                </div>
              }
            </div>
          }
        </div>
      </section>
    } @empty {
      @if (rolls.state() === 'error') {
        <p class="error">The Endgame Analysis data could not be loaded.</p>
      } @else {
        <p class="lede">Loading the list…</p>
      }
    }
  `,
})
export class ShoppingPage {
  protected readonly auth = inject(AuthService);
  protected readonly account = inject(AccountService);
  protected readonly manifest = inject(ManifestService);
  protected readonly rolls = inject(RollsService);
  private readonly api = inject(BungieApiService);

  protected readonly error = signal<string | null>(null);
  private readonly ownedIndex = signal<OwnedIndex | null>(null);
  private loadedId: string | null = null;

  protected readonly groups = computed<readonly ShoppingGroup[]>(() => {
    this.rolls.state();
    const list = this.rolls.analysis?.shoppingList ?? [];
    if (list.length === 0) return [];
    const owned = this.ownedIndex();
    const rows = list.map((item) => this.toRow(item, owned));
    const byPriority = new Map<string, ShoppingRow[]>();
    for (const row of rows) {
      const key = row.item.priority;
      const group = byPriority.get(key) ?? [];
      group.push(row);
      byPriority.set(key, group);
    }
    const priorities = [
      ...PRIORITY_ORDER.filter((p) => byPriority.has(p)),
      ...[...byPriority.keys()].filter((p) => !PRIORITY_ORDER.includes(p)),
    ];
    return priorities.map((priority) => ({
      priority,
      rows: byPriority.get(priority) ?? [],
    }));
  });

  constructor() {
    void this.rolls.load().catch(() => {
      // groups() surfaces the error state.
    });
    effect(() => {
      if (!this.auth.isSignedIn()) {
        this.ownedIndex.set(null);
        this.loadedId = null;
        return;
      }
      const membership = this.account.selected();
      if (!membership) return;
      if (membership.membershipId === this.loadedId) return;
      this.loadedId = membership.membershipId;
      untracked(() => void this.loadOwnership(membership));
    });
  }

  private toRow(item: SheetShoppingItem, owned: OwnedIndex | null): ShoppingRow {
    if (!owned) return { item, owned: false, satisfied: false, ownedAlternatives: [] };
    const copies = owned.get(normalizeName(item.name)) ?? [];
    const wanted = shoppingWeapon(item);
    const wantsPerks = item.col1.length > 0 || item.col2.length > 0;
    return {
      item,
      owned: copies.length > 0,
      satisfied:
        wantsPerks && copies.some((copy) => evaluateRoll(copy.socketOptionNames, wanted).isGodRoll),
      ownedAlternatives: item.alternatives.filter((alt) => owned.has(normalizeName(alt))),
    };
  }

  private async loadOwnership(membership: UserInfoCard): Promise<void> {
    this.error.set(null);
    try {
      const [defs, profile] = await Promise.all([
        this.manifest.load(),
        this.api.getFullProfile(membership.membershipType, membership.membershipId),
      ]);
      const socketsMap = profile.itemComponents.sockets?.data;
      const reusableMap = profile.itemComponents.reusablePlugs?.data;
      const instances = profile.itemComponents.instances.data ?? {};
      const index = new Map<string, ItemView[]>();
      const add = (item: DestinyItemComponent) => {
        const view = toItemView(item, defs.items, instances, socketsMap, reusableMap);
        const key = normalizeName(view.name);
        const list = index.get(key) ?? [];
        list.push(view);
        index.set(key, list);
      };
      for (const item of profile.profileInventory.data?.items ?? []) add(item);
      for (const list of Object.values(profile.characterInventories.data ?? {})) {
        for (const item of list.items) add(item);
      }
      for (const list of Object.values(profile.characterEquipment.data ?? {})) {
        for (const item of list.items) add(item);
      }
      this.ownedIndex.set(index);
    } catch (err) {
      if (err instanceof BungieApiError && err.status === 401) {
        this.auth.signOut();
        this.error.set('Your Bungie.net session expired — please sign in again.');
      } else {
        this.error.set(err instanceof Error ? err.message : 'Failed to check your inventory.');
      }
    }
  }
}
