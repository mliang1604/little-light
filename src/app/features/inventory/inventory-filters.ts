import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';
import { DAMAGE_TYPE_NAMES } from '../../core/bungie';
import { normalizeName } from '../../core/rolls';
import type { RollAssessment } from '../../core/rolls';
import type { ItemView } from '../../core/inventory';

export type MatchFilter = 'god' | 'partial' | 'listed' | 'unlisted';

export interface InventoryFilterState {
  readonly text: string;
  readonly tiers: readonly string[];
  readonly matches: readonly MatchFilter[];
  readonly types: readonly string[];
  readonly elements: readonly string[];
  readonly slots: readonly number[];
  readonly gearTiers: readonly number[];
  readonly sources: readonly string[];
}

export const EMPTY_FILTERS: InventoryFilterState = {
  text: '',
  tiers: [],
  matches: [],
  types: [],
  elements: [],
  slots: [],
  gearTiers: [],
  sources: [],
};

export interface FilterFacets {
  readonly tiers: readonly string[];
  readonly types: readonly string[];
  readonly sources: readonly string[];
}

export const WEAPON_SLOTS: readonly { readonly hash: number; readonly label: string }[] = [
  { hash: 1498876634, label: 'Kinetic' },
  { hash: 2465295065, label: 'Energy' },
  { hash: 953998645, label: 'Power' },
];

export const ELEMENTS: readonly string[] = ['Kinetic', 'Arc', 'Solar', 'Void', 'Stasis', 'Strand'];

export const GEAR_TIERS: readonly number[] = [1, 2, 3, 4, 5];

const MATCH_OPTIONS: readonly { readonly value: MatchFilter; readonly label: string }[] = [
  { value: 'god', label: 'God roll' },
  { value: 'partial', label: 'Partial match' },
  { value: 'listed', label: 'Listed' },
  { value: 'unlisted', label: 'Not listed' },
];

export function isEmptyFilter(state: InventoryFilterState): boolean {
  return (
    state.text.trim() === '' &&
    state.tiers.length === 0 &&
    state.matches.length === 0 &&
    state.types.length === 0 &&
    state.elements.length === 0 &&
    state.slots.length === 0 &&
    state.gearTiers.length === 0 &&
    state.sources.length === 0
  );
}

export function matchCategory(assessment: RollAssessment | null): MatchFilter {
  if (!assessment) return 'unlisted';
  if (assessment.isGodRoll) return 'god';
  if (assessment.perk1Match || assessment.perk2Match) return 'partial';
  return 'listed';
}

/** One item against the whole filter state; sheet-only facets treat unlisted items as misses. */
export function matchesFilters(
  item: ItemView,
  assessment: RollAssessment | null,
  state: InventoryFilterState,
): boolean {
  const text = state.text.trim();
  if (text) {
    const query = normalizeName(text);
    const inName = normalizeName(item.name).includes(query);
    const inPerks = (item.socketOptionNames ?? []).some((socket) =>
      socket.some((name) => normalizeName(name).includes(query)),
    );
    if (!inName && !inPerks) return false;
  }
  if (state.tiers.length > 0) {
    if (!assessment?.weapon.tier || !state.tiers.includes(assessment.weapon.tier)) return false;
  }
  if (state.matches.length > 0 && !state.matches.includes(matchCategory(assessment))) return false;
  if (state.types.length > 0) {
    if (!assessment || !state.types.includes(assessment.weapon.type)) return false;
  }
  if (state.elements.length > 0) {
    const element = DAMAGE_TYPE_NAMES[item.damageType ?? 0];
    if (!element || !state.elements.includes(element)) return false;
  }
  if (state.slots.length > 0 && !state.slots.includes(item.bucket)) return false;
  if (state.gearTiers.length > 0 && !state.gearTiers.includes(item.gearTier ?? 0)) return false;
  if (state.sources.length > 0) {
    if (!assessment?.weapon.source || !state.sources.includes(assessment.weapon.source)) {
      return false;
    }
  }
  return true;
}

function toggleValue<T>(values: readonly T[], value: T): readonly T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

@Component({
  selector: 'app-inventory-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'openChip.set(null)' },
  template: `
    <div class="filter-bar" (click)="$event.stopPropagation()">
      <input
        class="filter-text"
        type="search"
        placeholder="Search weapons & perks…"
        [value]="state().text"
        (input)="onText($event)"
      />

      @for (chip of chips(); track chip.key) {
        <div class="chip">
          <button
            type="button"
            class="chip-button"
            [class.chip-on]="chip.selectedCount > 0"
            (click)="toggleChip(chip.key)"
          >
            {{ chip.label }}@if (chip.selectedCount > 0) {<span> · {{ chip.selectedCount }}</span>}
          </button>
          @if (openChip() === chip.key) {
            <div class="chip-panel">
              @for (option of chip.options; track option.key) {
                <label class="chip-option">
                  <input
                    type="checkbox"
                    [checked]="option.selected"
                    (change)="chip.toggle(option.key)"
                  />
                  <span>{{ option.label }}</span>
                </label>
              }
            </div>
          }
        </div>
      }

      @if (!isEmpty()) {
        <button type="button" class="link-button" (click)="clearAll()">Clear</button>
      }
      <span class="filter-count">{{ shown() }} / {{ total() }}</span>
    </div>
  `,
})
export class InventoryFilters {
  readonly state = model.required<InventoryFilterState>();
  readonly facets = input.required<FilterFacets>();
  readonly shown = input.required<number>();
  readonly total = input.required<number>();

  protected readonly openChip = signal<string | null>(null);

  protected isEmpty(): boolean {
    return isEmptyFilter(this.state());
  }

  protected chips(): readonly ChipView[] {
    const state = this.state();
    const facets = this.facets();
    return [
      this.chip('tier', 'Tier', facets.tiers, state.tiers, (v) =>
        this.patch({ tiers: toggleValue(state.tiers, v) }),
      ),
      {
        key: 'match',
        label: 'Match',
        selectedCount: state.matches.length,
        options: MATCH_OPTIONS.map((o) => ({
          key: o.value,
          label: o.label,
          selected: state.matches.includes(o.value),
        })),
        toggle: (key) => this.patch({ matches: toggleValue(state.matches, key as MatchFilter) }),
      },
      this.chip('type', 'Type', facets.types, state.types, (v) =>
        this.patch({ types: toggleValue(state.types, v) }),
      ),
      this.chip('element', 'Element', ELEMENTS, state.elements, (v) =>
        this.patch({ elements: toggleValue(state.elements, v) }),
      ),
      {
        key: 'slot',
        label: 'Slot',
        selectedCount: state.slots.length,
        options: WEAPON_SLOTS.map((s) => ({
          key: String(s.hash),
          label: s.label,
          selected: state.slots.includes(s.hash),
        })),
        toggle: (key) => this.patch({ slots: toggleValue(state.slots, Number(key)) }),
      },
      {
        key: 'gearTier',
        label: 'Gear Tier',
        selectedCount: state.gearTiers.length,
        options: GEAR_TIERS.map((t) => ({
          key: String(t),
          label: `Tier ${t}`,
          selected: state.gearTiers.includes(t),
        })),
        toggle: (key) => this.patch({ gearTiers: toggleValue(state.gearTiers, Number(key)) }),
      },
      this.chip('source', 'Source', facets.sources, state.sources, (v) =>
        this.patch({ sources: toggleValue(state.sources, v) }),
      ),
    ];
  }

  protected toggleChip(key: string): void {
    this.openChip.update((open) => (open === key ? null : key));
  }

  protected onText(event: Event): void {
    this.patch({ text: (event.target as HTMLInputElement).value });
  }

  protected clearAll(): void {
    this.state.set(EMPTY_FILTERS);
  }

  private chip(
    key: string,
    label: string,
    values: readonly string[],
    selected: readonly string[],
    toggle: (value: string) => void,
  ): ChipView {
    return {
      key,
      label,
      selectedCount: selected.length,
      options: values.map((value) => ({ key: value, label: value, selected: selected.includes(value) })),
      toggle,
    };
  }

  private patch(partial: Partial<InventoryFilterState>): void {
    this.state.set({ ...this.state(), ...partial });
  }
}

interface ChipView {
  readonly key: string;
  readonly label: string;
  readonly selectedCount: number;
  readonly options: readonly { readonly key: string; readonly label: string; readonly selected: boolean }[];
  readonly toggle: (key: string) => void;
}
