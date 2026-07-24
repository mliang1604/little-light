import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { BUNGIE_ROOT } from '../../core/bungie';
import type { ItemDetailView } from '../../core/inventory';

@Component({
  selector: 'app-item-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="detail-backdrop" (click)="closed.emit()">
      <aside
        class="detail-panel"
        role="dialog"
        [attr.aria-label]="detail().item.name"
        (click)="$event.stopPropagation()"
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
            @if (detail().item.quantity > 1) {
              <span class="detail-sub">x{{ detail().item.quantity }}</span>
            }
          </div>
          <button type="button" class="detail-close" (click)="closed.emit()" aria-label="Close">
            ×
          </button>
        </header>

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
                @for (perk of column; track $index) {
                  <span
                    class="plug"
                    [class.plug-active]="perk.active"
                    [class.plug-inactive]="!perk.active"
                    [title]="perk.name"
                  >
                    @if (perk.icon; as icon) {
                      <img [src]="root + icon" [alt]="perk.name" loading="lazy" />
                    } @else {
                      <span class="plug-fallback">?</span>
                    }
                  </span>
                }
              </div>
            }
          </div>
        }

        @if (detail().mods.length > 0) {
          <h3 class="inv-label">Mods</h3>
          <div class="detail-plugs">
            @for (plug of detail().mods; track $index) {
              <span class="plug" [title]="plug.name">
                @if (plug.icon; as icon) {
                  <img [src]="root + icon" [alt]="plug.name" loading="lazy" />
                } @else {
                  <span class="plug-fallback">?</span>
                }
              </span>
            }
          </div>
        }
      </aside>
    </div>
  `,
})
export class ItemDetail {
  readonly detail = input.required<ItemDetailView>();
  readonly closed = output<void>();

  protected readonly root = BUNGIE_ROOT;
}
