import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { BREAKER_NAMES, BUNGIE_ROOT } from '../../core/bungie';
import { BungieApiService } from '../../core/bungie-api.service';
import { RollsService } from '../../core/rolls.service';
import { composePlugDescription } from '../../core/inventory';
import { normalizeName } from '../../core/rolls';
import type { RollAssessment, SheetPerk } from '../../core/rolls';
import type { ItemDetailView, ItemPlugView } from '../../core/inventory';

/** Viewport-fixed placement recomputed from the anchor element on every scroll. */
export interface PopoverPosition {
  readonly left: number;
  readonly top: number;
  readonly maxHeight: number;
}

interface PlugInfo extends PopoverPosition {
  readonly hash: number;
  readonly name: string;
  readonly icon?: string;
  readonly description: string;
  readonly loading: boolean;
  readonly sheet?: SheetPerk;
}

/** Keep in sync with the .detail-panel width in styles.css. */
const PANEL_WIDTH = 340;
const PANEL_MARGIN = 8;
const PLUG_POPOVER_WIDTH = 260;

@Component({
  selector: 'app-item-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    <div class="detail-backdrop" (click)="closed.emit()">
      @if (position(); as pos) {
        <aside
          class="detail-panel"
          role="dialog"
          [attr.aria-label]="detail().item.name"
          [style.left.px]="pos.left"
          [style.top.px]="pos.top"
          [style.max-height.px]="pos.maxHeight"
          (click)="onPanelClick($event)"
        >
          <header [class]="'detail-header tier-h-' + detail().item.tier">
            <div class="detail-title">
              <h2>{{ detail().item.name }}</h2>
              <p>{{ detail().item.itemType }}</p>
            </div>
            <div class="detail-power">
              @if (detail().item.power; as power) {
                <span class="detail-power-value">✦ {{ power }}</span>
              }
              @if (detail().item.gearTier; as gearTier) {
                <span class="detail-sub">Tier {{ gearTier }}</span>
              }
              @if (breakerName(); as breaker) {
                <span class="detail-breaker">{{ breaker }}</span>
              }
              @if (detail().item.quantity > 1) {
                <span class="detail-sub">x{{ detail().item.quantity }}</span>
              }
            </div>
            <button type="button" class="detail-close" (click)="closed.emit()" aria-label="Close">
              ×
            </button>
          </header>

          @if (roll(); as r) {
            <div class="detail-sheet">
              <p class="detail-sheet-line">
                Endgame Analysis: <strong>{{ r.weapon.tier ?? '?' }}-tier</strong>
                @if (r.weapon.rank) {
                  <span>#{{ r.weapon.rank }}</span>
                }
                @if (r.weapon.source) {
                  <span>· {{ r.weapon.source }}</span>
                }
                @if (r.weapon.stun) {
                  <span>· Stun: {{ r.weapon.stun }}</span>
                }
                @if (r.isPerfectRoll) {
                  <span class="detail-god">★ perfect roll</span>
                } @else if (r.isGodRoll) {
                  <span class="detail-god">★ god roll</span>
                }
              </p>
              @if (r.weapon.notes) {
                <p class="detail-sheet-notes">{{ r.weapon.notes }}</p>
              }
            </div>
          }

          @if (detail().stats.length > 0) {
            <dl class="detail-stats">
              @for (stat of detail().stats; track stat.name) {
                <div class="detail-stat">
                  <dt>{{ stat.name }}</dt>
                  <dd>
                    @if (stat.barPercent != null) {
                      <span class="stat-track">
                        <span class="stat-fill" [style.width.%]="stat.barPercent"></span>
                      </span>
                    }
                    <span class="stat-value">{{ stat.value }}</span>
                  </dd>
                </div>
              }
            </dl>
          }

          @if (detail().perkColumns.length > 0) {
            <h3 class="inv-label">Perks</h3>
            <div class="perk-columns">
              @for (column of detail().perkColumns; track $index) {
                <div class="perk-column">
                  @for (perk of column; track perk.hash) {
                    <button
                      type="button"
                      class="plug"
                      [class.plug-active]="perk.active"
                      [class.plug-inactive]="!perk.active"
                      [class.plug-selected]="plugInfo()?.hash === perk.hash"
                      [class.plug-recommended]="isRecommended(perk.name)"
                      [title]="perk.name"
                      (click)="showPlugInfo(perk, $event)"
                    >
                      @if (perk.icon; as icon) {
                        <img [src]="root + icon" [alt]="perk.name" loading="lazy" />
                      } @else {
                        <span class="plug-fallback">?</span>
                      }
                    </button>
                  }
                </div>
              }
            </div>
          }

          @if (detail().mods.length > 0) {
            <h3 class="inv-label">Mods</h3>
            <div class="detail-plugs">
              @for (plug of detail().mods; track plug.hash) {
                <button
                  type="button"
                  class="plug"
                  [class.plug-selected]="plugInfo()?.hash === plug.hash"
                  [title]="plug.name"
                  (click)="showPlugInfo(plug, $event)"
                >
                  @if (plug.icon; as icon) {
                    <img [src]="root + icon" [alt]="plug.name" loading="lazy" />
                  } @else {
                    <span class="plug-fallback">?</span>
                  }
                </button>
              }
            </div>
          }
        </aside>
      }

      @if (plugInfo(); as info) {
        <div
          class="plug-popover"
          [style.left.px]="info.left"
          [style.top.px]="info.top"
          [style.max-height.px]="info.maxHeight"
          (click)="$event.stopPropagation()"
        >
          <header class="plug-popover-header">
            @if (info.icon; as icon) {
              <img class="plug-popover-icon" [src]="root + icon" alt="" />
            }
            <h4>{{ info.name }}</h4>
          </header>
          @if (info.sheet; as sheet) {
            <p class="plug-sheet">
              @if (sheet.tier; as tier) {
                <strong [class]="'sheet-tier-' + tier">{{ tier }}-tier</strong>
              }
              @if (sheet.rank) {
                <span> #{{ sheet.rank }}</span>
              }
              @if (sheet.tags.length > 0) {
                <span class="plug-sheet-tags"> · {{ sheet.tags.join(', ') }}</span>
              }
            </p>
            @if (sheet.description) {
              <p class="plug-sheet-notes">{{ sheet.description }}</p>
            }
          }
          <p>{{ info.loading ? 'Loading…' : info.description }}</p>
        </div>
      }
    </div>
  `,
})
export class ItemDetail {
  readonly detail = input.required<ItemDetailView>();
  readonly anchor = input.required<HTMLElement>();
  readonly roll = input<RollAssessment | null>(null);
  readonly closed = output<void>();

  protected readonly root = BUNGIE_ROOT;
  protected readonly position = signal<PopoverPosition | null>(null);
  protected readonly plugInfo = signal<PlugInfo | null>(null);

  private readonly api = inject(BungieApiService);
  private readonly rolls = inject(RollsService);
  private plugAnchor: HTMLElement | null = null;

  protected readonly breakerName = computed(
    () => BREAKER_NAMES[this.detail().item.breakerType ?? 0],
  );

  private readonly recommendedNames = computed(() => {
    const weapon = this.roll()?.weapon;
    if (!weapon) return new Set<string>();
    const { barrel, mag, perk1, perk2, origin } = weapon.columns;
    return new Set(
      [...barrel, ...mag, ...perk1, ...perk2, ...origin].map((name) => normalizeName(name)),
    );
  });

  constructor() {
    effect(() => {
      const anchor = this.anchor();
      untracked(() => this.reposition(anchor));
    });
    // Follow the anchor through page and inner-container scrolling; the
    // listeners live only while the popover is open.
    const onViewportChange = () => this.reposition(this.anchor());
    document.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
    window.addEventListener('resize', onViewportChange);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    });
  }

  protected isRecommended(name: string): boolean {
    return this.recommendedNames().has(normalizeName(name));
  }

  protected onEscape(): void {
    if (this.plugInfo()) {
      this.plugInfo.set(null);
    } else {
      this.closed.emit();
    }
  }

  protected onPanelClick(event: Event): void {
    event.stopPropagation();
    this.plugInfo.set(null);
    this.plugAnchor = null;
  }

  protected async showPlugInfo(plug: ItemPlugView, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.plugInfo()?.hash === plug.hash) {
      this.plugInfo.set(null);
      this.plugAnchor = null;
      return;
    }
    this.plugAnchor = event.currentTarget as HTMLElement;
    const placement = plugPopoverPosition(this.plugAnchor.getBoundingClientRect());
    const sheet = this.rolls.lookupPerk(plug.name);
    this.plugInfo.set({ ...plug, ...placement, sheet, description: '', loading: true });
    let description: string;
    try {
      const extras = await this.api.getItemExtras(plug.hash);
      const sandbox = await Promise.all(
        extras.perkHashes.map((hash) =>
          this.api.getSandboxPerkDescription(hash).catch(() => ''),
        ),
      );
      description =
        composePlugDescription(extras.description, sandbox) || 'No description available.';
    } catch {
      description = 'Could not load the description.';
    }
    const current = this.plugInfo();
    if (current?.hash === plug.hash) {
      this.plugInfo.set({ ...current, description, loading: false });
    }
  }

  private reposition(anchor: HTMLElement): void {
    this.position.set(popoverPosition(anchor.getBoundingClientRect()));
    const info = this.plugInfo();
    if (info && this.plugAnchor) {
      this.plugInfo.set({
        ...info,
        ...plugPopoverPosition(this.plugAnchor.getBoundingClientRect()),
      });
    }
  }
}

/** Prefer the anchor's right side; flip left when cramped, clamp to the viewport. */
function popoverPosition(anchor: DOMRect): PopoverPosition {
  return anchoredPosition(anchor, PANEL_WIDTH, PANEL_MARGIN, 360);
}

function plugPopoverPosition(anchor: DOMRect): PopoverPosition {
  return anchoredPosition(anchor, PLUG_POPOVER_WIDTH, 6, 220);
}

function anchoredPosition(
  anchor: DOMRect,
  width: number,
  margin: number,
  bottomReserve: number,
): PopoverPosition {
  let left = anchor.right + margin;
  if (left + width + margin > window.innerWidth) {
    left = anchor.left - width - margin;
  }
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  const top = Math.max(margin, Math.min(anchor.top, window.innerHeight - bottomReserve));
  return { left, top, maxHeight: window.innerHeight - top - margin };
}
