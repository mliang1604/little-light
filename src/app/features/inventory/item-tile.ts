import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BUNGIE_ROOT } from '../../core/bungie';
import type { ItemView } from '../../core/inventory';

@Component({
  selector: 'app-item-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="'tile tier-' + item().tier" [title]="tooltip()">
      @if (item().icon; as icon) {
        <img class="tile-icon" [src]="root + icon" [alt]="item().name" loading="lazy" />
      }
      @if (item().watermark; as watermark) {
        <img class="tile-watermark" [src]="root + watermark" alt="" loading="lazy" />
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

  protected readonly root = BUNGIE_ROOT;

  protected readonly tooltip = computed(() => {
    const item = this.item();
    const power = item.power != null ? ` · ${item.power}` : '';
    return `${item.name} · ${item.itemType}${power}`;
  });
}
