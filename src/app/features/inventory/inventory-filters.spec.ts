import { EMPTY_FILTERS, isEmptyFilter, matchCategory, matchesFilters } from './inventory-filters';
import type { InventoryFilterState } from './inventory-filters';
import { evaluateRoll } from '../../core/rolls';
import type { SheetWeapon } from '../../core/rolls';
import type { ItemView } from '../../core/inventory';

const KINETIC_SLOT = 1498876634;

function itemView(overrides: Partial<ItemView>): ItemView {
  return {
    itemHash: 1,
    instanceId: 'i1',
    name: 'Kindled Orchid',
    tier: 5,
    quantity: 1,
    itemType: 'Hand Cannon',
    bucket: KINETIC_SLOT,
    damageType: 4,
    gearTier: 3,
    socketOptionNames: [['Repulsor Brace'], ['Destabilizing Rounds']],
    ...overrides,
  };
}

const SHEET_WEAPON: SheetWeapon = {
  name: 'Kindled Orchid',
  type: 'Hand Cannon',
  source: 'Arena Ops',
  enhanceable: true,
  tier: 'S',
  rank: 1,
  columns: {
    barrel: [],
    mag: [],
    perk1: ['Repulsor Brace'],
    perk2: ['Destabilizing Rounds'],
    origin: [],
  },
};

function filters(overrides: Partial<InventoryFilterState>): InventoryFilterState {
  return { ...EMPTY_FILTERS, ...overrides };
}

const item = itemView({});
const god = evaluateRoll(item.socketOptionNames, SHEET_WEAPON);

describe('matchCategory', () => {
  it('categorizes god, partial, listed, and unlisted', () => {
    expect(matchCategory(god)).toBe('god');
    expect(matchCategory(evaluateRoll([['Repulsor Brace']], SHEET_WEAPON))).toBe('partial');
    expect(matchCategory(evaluateRoll([['Frenzy']], SHEET_WEAPON))).toBe('listed');
    expect(matchCategory(null)).toBe('unlisted');
  });
});

describe('matchesFilters', () => {
  it('passes everything with empty filters', () => {
    expect(isEmptyFilter(EMPTY_FILTERS)).toBe(true);
    expect(matchesFilters(item, null, EMPTY_FILTERS)).toBe(true);
  });

  it('matches text against weapon names and perk options', () => {
    expect(matchesFilters(item, god, filters({ text: 'kindled' }))).toBe(true);
    expect(matchesFilters(item, god, filters({ text: 'repulsor' }))).toBe(true);
    expect(matchesFilters(item, god, filters({ text: 'gjallarhorn' }))).toBe(false);
  });

  it('filters by sheet tier, treating unlisted items as misses', () => {
    expect(matchesFilters(item, god, filters({ tiers: ['S'] }))).toBe(true);
    expect(matchesFilters(item, god, filters({ tiers: ['A'] }))).toBe(false);
    expect(matchesFilters(item, null, filters({ tiers: ['S'] }))).toBe(false);
  });

  it('filters by match category', () => {
    expect(matchesFilters(item, god, filters({ matches: ['god'] }))).toBe(true);
    expect(matchesFilters(item, null, filters({ matches: ['god'] }))).toBe(false);
    expect(matchesFilters(item, null, filters({ matches: ['unlisted'] }))).toBe(true);
  });

  it('filters by element, slot, and gear tier from the item itself', () => {
    expect(matchesFilters(item, god, filters({ elements: ['Void'] }))).toBe(true);
    expect(matchesFilters(item, god, filters({ elements: ['Solar'] }))).toBe(false);
    expect(matchesFilters(itemView({ damageType: undefined }), god, filters({ elements: ['Void'] }))).toBe(false);
    expect(matchesFilters(item, god, filters({ slots: [KINETIC_SLOT] }))).toBe(true);
    expect(matchesFilters(item, god, filters({ slots: [953998645] }))).toBe(false);
    expect(matchesFilters(item, god, filters({ gearTiers: [3] }))).toBe(true);
    expect(matchesFilters(item, god, filters({ gearTiers: [5] }))).toBe(false);
  });

  it('filters by sheet type and source', () => {
    expect(matchesFilters(item, god, filters({ types: ['Hand Cannon'] }))).toBe(true);
    expect(matchesFilters(item, god, filters({ types: ['Rocket Launcher'] }))).toBe(false);
    expect(matchesFilters(item, god, filters({ sources: ['Arena Ops'] }))).toBe(true);
    expect(matchesFilters(item, null, filters({ sources: ['Arena Ops'] }))).toBe(false);
  });

  it('combines facets with AND semantics', () => {
    expect(
      matchesFilters(item, god, filters({ tiers: ['S'], matches: ['god'], elements: ['Void'] })),
    ).toBe(true);
    expect(
      matchesFilters(item, god, filters({ tiers: ['S'], matches: ['god'], elements: ['Solar'] })),
    ).toBe(false);
  });
});
