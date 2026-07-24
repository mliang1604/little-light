import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { BUNGIE_ROOT } from '../../core/bungie';
import { BungieApiService } from '../../core/bungie-api.service';
import type { ItemDetailView, ItemPlugView } from '../../core/inventory';

interface PlugInfo {
  readonly hash: number;
  readonly name: string;
  readonly icon?: string;
  readonly description: string;
  readonly loading: boolean;
}

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
                @for (perk of column; track perk.hash) {
                  <button
                    type="button"
                    class="plug"
                    [class.plug-active]="perk.active"
                    [class.plug-inactive]="!perk.active"
                    [class.plug-selected]="plugInfo()?.hash === perk.hash"
                    [title]="perk.name"
                    (click)="showPlugInfo(perk)"
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
                (click)="showPlugInfo(plug)"
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

        @if (plugInfo(); as info) {
          <div class="perk-info">
            @if (info.icon; as icon) {
              <img class="perk-info-icon" [src]="root + icon" alt="" />
            }
            <div>
              <h4>{{ info.name }}</h4>
              <p>{{ info.loading ? 'Loading…' : info.description }}</p>
            </div>
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
  protected readonly plugInfo = signal<PlugInfo | null>(null);

  private readonly api = inject(BungieApiService);

  protected async showPlugInfo(plug: ItemPlugView): Promise<void> {
    if (this.plugInfo()?.hash === plug.hash) {
      this.plugInfo.set(null);
      return;
    }
    this.plugInfo.set({ ...plug, description: '', loading: true });
    let description: string;
    try {
      const extras = await this.api.getItemExtras(plug.hash);
      description = extras.description || 'No description available.';
    } catch {
      description = 'Could not load the description.';
    }
    if (this.plugInfo()?.hash === plug.hash) {
      this.plugInfo.set({ ...plug, description, loading: false });
    }
  }
}
