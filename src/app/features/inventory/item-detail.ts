import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { BUNGIE_ROOT } from '../../core/bungie';
import { BungieApiService } from '../../core/bungie-api.service';
import { composePlugDescription } from '../../core/inventory';
import type { ItemDetailView, ItemPlugView } from '../../core/inventory';

/** Viewport-fixed placement computed from the clicked tile's rect. */
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
}

const PLUG_POPOVER_WIDTH = 260;

@Component({
  selector: 'app-item-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    <div class="detail-backdrop" (click)="closed.emit()">
      <aside
        class="detail-panel"
        role="dialog"
        [attr.aria-label]="detail().item.name"
        [style.left.px]="position().left"
        [style.top.px]="position().top"
        [style.max-height.px]="position().maxHeight"
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
          <p>{{ info.loading ? 'Loading…' : info.description }}</p>
        </div>
      }
    </div>
  `,
})
export class ItemDetail {
  readonly detail = input.required<ItemDetailView>();
  readonly position = input.required<PopoverPosition>();
  readonly closed = output<void>();

  protected readonly root = BUNGIE_ROOT;
  protected readonly plugInfo = signal<PlugInfo | null>(null);

  private readonly api = inject(BungieApiService);

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
  }

  protected async showPlugInfo(plug: ItemPlugView, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.plugInfo()?.hash === plug.hash) {
      this.plugInfo.set(null);
      return;
    }
    const anchor = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const placement = plugPopoverPosition(anchor);
    this.plugInfo.set({ ...plug, ...placement, description: '', loading: true });
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
    if (this.plugInfo()?.hash === plug.hash) {
      this.plugInfo.set({ ...plug, ...placement, description, loading: false });
    }
  }
}

/** Prefer the plug's right side; flip left when cramped, clamp to the viewport. */
function plugPopoverPosition(anchor: DOMRect): PopoverPosition {
  const margin = 6;
  let left = anchor.right + margin;
  if (left + PLUG_POPOVER_WIDTH + margin > window.innerWidth) {
    left = anchor.left - PLUG_POPOVER_WIDTH - margin;
  }
  left = Math.max(margin, Math.min(left, window.innerWidth - PLUG_POPOVER_WIDTH - margin));
  const top = Math.max(margin, Math.min(anchor.top, window.innerHeight - 220));
  return { left, top, maxHeight: window.innerHeight - top - margin };
}
