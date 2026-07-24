import {
  GEAR_BUCKETS,
  buildInventoryView,
  buildItemDetail,
  composePlugDescription,
  toItemView,
} from './inventory';
import type {
  DestinyCharacter,
  DestinyFullProfile,
  DestinyItemComponent,
  DestinyItemInstance,
  DestinyItemReusablePlugs,
  DestinyItemSocketsComponent,
  DestinyItemStatsComponent,
} from './bungie';
import type { ItemDefLite, ItemDefs, StatNames } from './manifest.service';

const KINETIC = 1498876634;
const HELMET = 3448274439;
const VAULT = 138197802;

function def(overrides: Partial<ItemDefLite>): ItemDefLite {
  return { name: 'Item', tier: 5, bucket: KINETIC, itemType: 'Auto Rifle', ...overrides };
}

const DEFS: ItemDefs = new Map<number, ItemDefLite>([
  [1, def({ name: 'Auto Low' })],
  [2, def({ name: 'Auto High', tier: 6 })],
  [3, def({ name: 'Zeta First' })],
  [4, def({ name: 'Helm', bucket: HELMET, itemType: 'Helmet' })],
  [5, def({ name: 'Shards', tier: 3, bucket: 0, itemType: 'Material' })],
  [6, def({ name: 'Kill Tracker', tier: 2, bucket: 0, itemType: 'Weapon Tracker' })],
]);

function item(
  itemHash: number,
  bucketHash: number,
  instanceId?: string,
  quantity = 1,
): DestinyItemComponent {
  return { itemHash, bucketHash, itemInstanceId: instanceId, quantity };
}

function character(dateLastPlayed: string): DestinyCharacter {
  return {
    characterId: 'set-by-key',
    classType: 2,
    raceType: 1,
    light: 480,
    emblemPath: '/e.jpg',
    emblemBackgroundPath: '/eb.jpg',
    minutesPlayedTotal: '60',
    dateLastPlayed,
  };
}

function profile(parts: {
  characters?: Record<string, DestinyCharacter>;
  equipment?: Record<string, DestinyItemComponent[]>;
  inventories?: Record<string, DestinyItemComponent[]>;
  vault?: DestinyItemComponent[];
  instances?: Record<string, DestinyItemInstance>;
  itemStats?: Record<string, DestinyItemStatsComponent>;
  sockets?: Record<string, DestinyItemSocketsComponent>;
  reusablePlugs?: Record<string, DestinyItemReusablePlugs>;
}): DestinyFullProfile {
  const wrap = (record?: Record<string, DestinyItemComponent[]>) =>
    record
      ? Object.fromEntries(Object.entries(record).map(([k, items]) => [k, { items }]))
      : undefined;
  return {
    profile: {},
    characters: { data: parts.characters },
    profileInventory: { data: parts.vault ? { items: parts.vault } : undefined },
    characterInventories: { data: wrap(parts.inventories) },
    characterEquipment: { data: wrap(parts.equipment) },
    itemComponents: {
      instances: { data: parts.instances },
      stats: { data: parts.itemStats },
      sockets: { data: parts.sockets },
      reusablePlugs: { data: parts.reusablePlugs },
    },
  };
}

describe('toItemView', () => {
  it('resolves definition fields and instance power', () => {
    const view = toItemView(item(2, KINETIC, 'inst-1'), DEFS, {
      'inst-1': { primaryStat: { value: 500 } },
    });
    expect(view).toMatchObject({ name: 'Auto High', tier: 6, power: 500, quantity: 1 });
  });

  it('falls back gracefully for unknown definitions and stackables', () => {
    const view = toItemView(item(999, KINETIC, undefined, 25), DEFS, {});
    expect(view).toMatchObject({ name: 'Unknown item', tier: 0, power: undefined, quantity: 25 });
  });

  it('maps the Edge of Fate gear tier', () => {
    const view = toItemView(item(2, KINETIC, 'inst-1'), DEFS, {
      'inst-1': { primaryStat: { value: 500 }, gearTier: 5 },
    });
    expect(view.gearTier).toBe(5);
  });

  it('treats gearTier 0 (untiered legacy gear) as absent', () => {
    const view = toItemView(item(2, KINETIC, 'inst-1'), DEFS, { 'inst-1': { gearTier: 0 } });
    expect(view.gearTier).toBeUndefined();
  });
});

describe('buildInventoryView', () => {
  it('orders characters by last played and maps equipped + stored per bucket cell', () => {
    const view = buildInventoryView(
      profile({
        characters: {
          older: character('2026-01-01T00:00:00Z'),
          newer: character('2026-07-01T00:00:00Z'),
        },
        equipment: { newer: [item(2, KINETIC, 'eq')], older: [] },
        inventories: {
          newer: [item(1, KINETIC, 'low'), item(3, KINETIC, 'high'), item(4, HELMET, 'helm')],
          older: [],
        },
        instances: {
          eq: { primaryStat: { value: 490 } },
          low: { primaryStat: { value: 450 } },
          high: { primaryStat: { value: 480 } },
          helm: { primaryStat: { value: 470 } },
        },
      }),
      DEFS,
    );

    expect(view.characters.map((c) => c.characterId)).toEqual(['newer', 'older']);

    const kinetic = view.rows.find((r) => r.hash === KINETIC)!;
    expect(kinetic.perCharacter).toHaveLength(2);
    expect(kinetic.perCharacter[0]!.equipped?.name).toBe('Auto High');
    expect(kinetic.perCharacter[0]!.stored.map((i) => i.name)).toEqual(['Zeta First', 'Auto Low']);
    expect(kinetic.perCharacter[1]!.equipped).toBeUndefined();
    expect(kinetic.perCharacter[1]!.stored).toEqual([]);

    const helmet = view.rows.find((r) => r.hash === HELMET)!;
    expect(helmet.perCharacter[0]!.stored.map((i) => i.name)).toEqual(['Helm']);
  });

  it('always emits every gear bucket row so bands stay aligned', () => {
    const view = buildInventoryView(profile({}), DEFS);
    expect(view.rows.map((r) => r.hash)).toEqual(GEAR_BUCKETS.map((b) => b.hash));
  });

  it('groups vault items by definition bucket, sorted by power then name', () => {
    const view = buildInventoryView(
      profile({
        vault: [
          item(1, VAULT, 'v1'),
          item(3, VAULT, 'v3'),
          item(4, VAULT, 'v4'),
          item(5, VAULT, undefined, 40),
        ],
        instances: {
          v1: { primaryStat: { value: 460 } },
          v3: { primaryStat: { value: 460 } },
          v4: { primaryStat: { value: 455 } },
        },
      }),
      DEFS,
    );

    const kinetic = view.rows.find((r) => r.hash === KINETIC)!;
    expect(kinetic.vault.map((i) => i.name)).toEqual(['Auto Low', 'Zeta First']);
    const helmet = view.rows.find((r) => r.hash === HELMET)!;
    expect(helmet.vault.map((i) => i.name)).toEqual(['Helm']);
    expect(view.otherVault).toHaveLength(1);
    expect(view.otherVault[0]).toMatchObject({ name: 'Shards', quantity: 40 });
    expect(view.vaultTotal).toBe(4);
  });

  it('ignores items not stored in the vault bucket', () => {
    const view = buildInventoryView(profile({ vault: [item(1, KINETIC, 'v1')] }), DEFS);
    expect(view.vaultTotal).toBe(0);
    expect(view.rows.every((r) => r.vault.length === 0)).toBe(true);
    expect(view.otherVault).toEqual([]);
  });

  it('separates postmaster engrams and lost items, preserving arrival order', () => {
    const ENGRAMS = 375726501;
    const POSTMASTER = 215593132;
    const view = buildInventoryView(
      profile({
        characters: { a: character('2026-07-01T00:00:00Z') },
        inventories: {
          a: [item(1, POSTMASTER, 'weak'), item(5, ENGRAMS), item(2, POSTMASTER, 'strong')],
        },
        instances: {
          weak: { primaryStat: { value: 10 } },
          strong: { primaryStat: { value: 500 } },
        },
      }),
      DEFS,
    );

    expect(view.postmaster).toHaveLength(1);
    expect(view.postmaster[0]!.engrams.map((i) => i.name)).toEqual(['Shards']);
    // Arrival order, not power order — postmaster overflow discards oldest first.
    expect(view.postmaster[0]!.lostItems.map((i) => i.name)).toEqual(['Auto Low', 'Auto High']);
    // Postmaster buckets must not leak into the gear rows.
    const kinetic = view.rows.find((r) => r.hash === KINETIC)!;
    expect(kinetic.perCharacter[0]!.stored).toEqual([]);
  });
});

describe('buildItemDetail', () => {
  const STAT_NAMES: StatNames = new Map([
    [4284893193, 'Rounds Per Minute'],
    [4043523819, 'Impact'],
    [1240592695, 'Range'],
    [3871231066, 'Magazine'],
  ]);

  const CATEGORY_NAMES = new Map([
    [111, 'WEAPON PERKS'],
    [222, 'WEAPON MODS'],
  ]);

  const instanced = toItemView(item(2, KINETIC, 'i1'), DEFS, {});

  it('maps and orders stats, with bars only for 0-100 gauges', () => {
    const detail = buildItemDetail(
      instanced,
      profile({
        itemStats: {
          i1: {
            stats: {
              '1240592695': { statHash: 1240592695, value: 66 },
              '3871231066': { statHash: 3871231066, value: 4 },
              '4284893193': { statHash: 4284893193, value: 90 },
              '4043523819': { statHash: 4043523819, value: 70 },
            },
          },
        },
      }),
      DEFS,
      STAT_NAMES,
      [],
      CATEGORY_NAMES,
    );

    expect(detail.stats.map((s) => s.name)).toEqual([
      'Rounds Per Minute',
      'Impact',
      'Range',
      'Magazine',
    ]);
    expect(detail.stats.find((s) => s.name === 'Range')!.barPercent).toBe(66);
    // Absolute stats read as numbers, not gauges.
    expect(detail.stats.find((s) => s.name === 'Rounds Per Minute')!.barPercent).toBeUndefined();
    expect(detail.stats.find((s) => s.name === 'Magazine')!.barPercent).toBeUndefined();
  });

  it('groups perk sockets into columns with the plugged option marked active', () => {
    const detail = buildItemDetail(
      instanced,
      profile({
        sockets: {
          i1: {
            sockets: [
              { plugHash: 1, isEnabled: true },
              { plugHash: 3, isEnabled: true },
              { plugHash: 4, isEnabled: true },
            ],
          },
        },
        reusablePlugs: {
          i1: { plugs: { '0': [{ plugItemHash: 1 }, { plugItemHash: 2 }] } },
        },
      }),
      DEFS,
      STAT_NAMES,
      [{ socketCategoryHash: 111, socketIndexes: [0, 1] }],
      CATEGORY_NAMES,
    );

    // Column 0 lists both options; the plugged one is active.
    expect(detail.perkColumns).toHaveLength(2);
    expect(detail.perkColumns[0]!.map((p) => [p.name, p.active])).toEqual([
      ['Auto Low', true],
      ['Auto High', false],
    ]);
    // Column 1 has no reusable options — the plugged perk becomes a single active entry.
    expect(detail.perkColumns[1]!.map((p) => [p.name, p.active])).toEqual([['Zeta First', true]]);
    // The remaining socket is not in a perk category, so it lands in mods.
    expect(detail.mods.map((m) => m.name)).toEqual(['Helm']);
  });

  it('falls back to a flat mods list when no socket categories are known', () => {
    const detail = buildItemDetail(
      instanced,
      profile({
        sockets: {
          i1: {
            sockets: [
              { plugHash: 1, isEnabled: true },
              { plugHash: 2, isEnabled: true, isVisible: false },
              { isEnabled: true },
              { plugHash: 999, isEnabled: true },
              { plugHash: 4, isEnabled: false },
            ],
          },
        },
      }),
      DEFS,
      STAT_NAMES,
      [],
      CATEGORY_NAMES,
    );

    expect(detail.perkColumns).toEqual([]);
    expect(detail.mods.map((p) => p.name)).toEqual(['Auto Low', '#999']);
  });

  it('excludes kill trackers from the mods list', () => {
    const detail = buildItemDetail(
      instanced,
      profile({
        sockets: {
          i1: {
            sockets: [
              { plugHash: 4, isEnabled: true },
              { plugHash: 6, isEnabled: true },
            ],
          },
        },
      }),
      DEFS,
      STAT_NAMES,
      [],
      CATEGORY_NAMES,
    );

    expect(detail.mods.map((p) => p.name)).toEqual(['Helm']);
  });

  it('returns empty sections for non-instanced items', () => {
    const stackable = toItemView(item(5, VAULT, undefined, 40), DEFS, {});
    const detail = buildItemDetail(stackable, profile({}), DEFS, STAT_NAMES, [], CATEGORY_NAMES);
    expect(detail.stats).toEqual([]);
    expect(detail.perkColumns).toEqual([]);
    expect(detail.mods).toEqual([]);
    expect(detail.item.quantity).toBe(40);
  });
});

describe('composePlugDescription', () => {
  it('prefers sandbox perk text over the generic item description', () => {
    expect(
      composePlugDescription('Upgrades this weapon to a Masterwork.', [
        'At 5 stacks of Markov Chain, switches to the bayonet.',
      ]),
    ).toBe('At 5 stacks of Markov Chain, switches to the bayonet.');
  });

  it('joins and dedupes multiple sandbox descriptions', () => {
    expect(composePlugDescription('generic', ['Effect A', 'Effect A', '', 'Effect B'])).toBe(
      'Effect A\n\nEffect B',
    );
  });

  it('falls back to the item description when no sandbox text exists', () => {
    expect(composePlugDescription('Restores your Ghost.', ['', '  '])).toBe(
      'Restores your Ghost.',
    );
  });
});
