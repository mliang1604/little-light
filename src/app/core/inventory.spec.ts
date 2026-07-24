import { buildCharacterColumns, buildVaultGroups, toItemView } from './inventory';
import type {
  DestinyCharacter,
  DestinyFullProfile,
  DestinyItemComponent,
  DestinyItemInstance,
} from './bungie';
import type { ItemDefLite, ItemDefs } from './manifest.service';

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
    itemComponents: { instances: { data: parts.instances } },
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

describe('buildCharacterColumns', () => {
  it('orders characters by last played and maps equipped + stored per bucket', () => {
    const result = buildCharacterColumns(
      profile({
        characters: {
          older: character('2026-01-01T00:00:00Z'),
          newer: character('2026-07-01T00:00:00Z'),
        },
        equipment: { newer: [item(2, KINETIC, 'eq')], older: [] },
        inventories: {
          newer: [
            item(1, KINETIC, 'low'),
            item(3, KINETIC, 'high'),
            item(4, HELMET, 'helm'),
          ],
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

    expect(result.map((c) => c.characterId)).toEqual(['newer', 'older']);

    const kinetic = result[0]!.buckets.find((b) => b.hash === KINETIC)!;
    expect(kinetic.equipped?.name).toBe('Auto High');
    expect(kinetic.stored.map((i) => i.name)).toEqual(['Zeta First', 'Auto Low']);

    const helmet = result[0]!.buckets.find((b) => b.hash === HELMET)!;
    expect(helmet.stored.map((i) => i.name)).toEqual(['Helm']);
    expect(helmet.equipped).toBeUndefined();
  });
});

describe('buildVaultGroups', () => {
  it('groups vault items by their definition bucket, sorted by power then name', () => {
    const result = buildVaultGroups(
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

    expect(result.map((g) => g.label)).toEqual(['Kinetic', 'Helmet', 'Other']);
    expect(result[0]!.items.map((i) => i.name)).toEqual(['Auto Low', 'Zeta First']);
    expect(result[2]!.items[0]).toMatchObject({ name: 'Shards', quantity: 40 });
  });

  it('ignores items not stored in the vault bucket', () => {
    const result = buildVaultGroups(profile({ vault: [item(1, KINETIC, 'v1')] }), DEFS);
    expect(result).toEqual([]);
  });
});
