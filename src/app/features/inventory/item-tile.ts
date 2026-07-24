import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BUNGIE_ROOT } from '../../core/bungie';
import type { ItemView } from '../../core/inventory';

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
      (click)="selected.emit(item())"
      (keydown.enter)="selected.emit(item())"
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
  readonly selected = output<ItemView>();

  protected readonly root = BUNGIE_ROOT;

  protected readonly pips = computed(() => {
    const gearTier = this.item().gearTier ?? 0;
    return Array.from({ length: Math.min(gearTier, MAX_GEAR_TIER) }, (_, i) => i);
  });

  protected readonly tooltip = computed(() => {
    const item = this.item();
    const power = item.power != null ? ` · ${item.power}` : '';
    const gearTier = item.gearTier != null ? ` · Tier ${item.gearTier}` : '';
    return `${item.name} · ${item.itemType}${power}${gearTier}`;
  });
}
