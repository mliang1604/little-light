import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BUNGIE_ROOT } from '../../core/bungie';
import type { ItemView } from '../../core/inventory';
import type { RollAssessment } from '../../core/rolls';

/** A clicked item plus where its tile sits, so the detail popover can anchor to it. */
export interface ItemSelection {
  readonly item: ItemView;
  readonly anchor: DOMRect;
}

const MAX_GEAR_TIER = 5;

@Component({
  selector: 'app-item-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      [class]="'tile tier-' + item().tier"
      [title]="tooltip()"
      role="button"
      tabindex="0"
      (click)="onSelect($event)"
      (keydown.enter)="onSelect($event)"
    >
      @if (item().icon; as icon) {
        <img class="tile-icon" [src]="root + icon" [alt]="item().name" loading="lazy" />
      }
      @if (item().watermark; as watermark) {
        <img class="tile-watermark" [src]="root + watermark" alt="" loading="lazy" />
      }
      @if (pips().length > 0) {
        <span class="tile-tiers" aria-hidden="true">
          @for (pip of pips(); track $index) {
            <i class="tile-pip"></i>
          }
        </span>
      }
      @if (roll(); as r) {
        <span class="tile-flags" aria-hidden="true">
          @if (r.weapon.tier; as sheetTier) {
            <span [class]="'tile-sheet-tier sheet-tier-' + sheetTier">{{ sheetTier }}</span>
          }
          @if (r.isGodRoll) {
            <span class="tile-god">★</span>
          }
        </span>
      }
      @if (item().power; as power) {
        <span class="tile-badge">{{ power }}</span>
      } @else if (item().quantity > 1) {
        <span class="tile-badge">x{{ item().quantity }}</span>
      }
    </div>
  `,
})
export class ItemTile {
  readonly item = input.required<ItemView>();
  readonly roll = input<RollAssessment | null>(null);
  readonly selected = output<ItemSelection>();

  protected readonly root = BUNGIE_ROOT;

  protected onSelect(event: Event): void {
    const anchor = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.selected.emit({ item: this.item(), anchor });
  }

  protected readonly pips = computed(() => {
    const gearTier = this.item().gearTier ?? 0;
    return Array.from({ length: Math.min(gearTier, MAX_GEAR_TIER) }, (_, i) => i);
  });

  protected readonly tooltip = computed(() => {
    const item = this.item();
    const power = item.power != null ? ` · ${item.power}` : '';
    const gearTier = item.gearTier != null ? ` · Tier ${item.gearTier}` : '';
    const roll = this.roll();
    const sheet = roll?.weapon.tier
      ? ` · Sheet ${roll.weapon.tier}${roll.weapon.rank ? ' #' + roll.weapon.rank : ''}${
          roll.isGodRoll ? ' · god roll' : ''
        }`
      : '';
    return `${item.name} · ${item.itemType}${power}${gearTier}${sheet}`;
  });
}
