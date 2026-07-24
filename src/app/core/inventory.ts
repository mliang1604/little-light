import type {
  DestinyCharacter,
  DestinyFullProfile,
  DestinyItemComponent,
  DestinyItemInstance,
} from './bungie';
import type { ItemDefLite, ItemDefs } from './manifest.service';

export interface ItemView {
  readonly itemHash: number;
  readonly instanceId?: string;
  readonly name: string;
  readonly icon?: string;
  readonly watermark?: string;
  readonly tier: number;
  readonly power?: number;
  readonly gearTier?: number;
  readonly quantity: number;
  readonly itemType: string;
}

export interface CharacterInfo {
  readonly characterId: string;
  readonly character: DestinyCharacter;
}

export interface CharacterBucketCell {
  readonly equipped?: ItemView;
  readonly stored: readonly ItemView[];
}

/** Per-character postmaster: engram slots plus lost items, in arrival order. */
export interface PostmasterCell {
  readonly engrams: readonly ItemView[];
  readonly lostItems: readonly ItemView[];
}

/** One horizontal band: a gear bucket across every character plus the vault. */
export interface BucketRow {
  readonly hash: number;
  readonly label: string;
  readonly perCharacter: readonly CharacterBucketCell[];
  readonly vault: readonly ItemView[];
}

export interface InventoryView {
  readonly characters: readonly CharacterInfo[];
  readonly postmaster: readonly PostmasterCell[];
  readonly rows: readonly BucketRow[];
  readonly otherVault: readonly ItemView[];
  readonly vaultTotal: number;
}

/** Weapon and armor buckets, in DIM's display order. */
export const GEAR_BUCKETS: readonly { readonly hash: number; readonly label: string }[] = [
  { hash: 1498876634, label: 'Kinetic' },
  { hash: 2465295065, label: 'Energy' },
  { hash: 953998645, label: 'Power' },
  { hash: 3448274439, label: 'Helmet' },
  { hash: 3551918588, label: 'Gauntlets' },
  { hash: 14239492, label: 'Chest' },
  { hash: 20886954, label: 'Legs' },
  { hash: 1585787867, label: 'Class Item' },
];

/** Everything in the vault sits in the General bucket; its definition says where it belongs. */
const VAULT_BUCKET = 138197802;

const ENGRAM_BUCKET = 375726501;
const POSTMASTER_BUCKET = 215593132;

export const ENGRAM_CAPACITY = 10;
export const POSTMASTER_CAPACITY = 21;

const FALLBACK_DEF: ItemDefLite = { name: 'Unknown item', tier: 0, bucket: 0, itemType: '' };

type Instances = Readonly<Record<string, DestinyItemInstance>>;

export function toItemView(
  item: DestinyItemComponent,
  defs: ItemDefs,
  instances: Instances,
): ItemView {
  const def = defs.get(item.itemHash) ?? FALLBACK_DEF;
  const instance = item.itemInstanceId ? instances[item.itemInstanceId] : undefined;
  return {
    itemHash: item.itemHash,
    instanceId: item.itemInstanceId,
    name: def.name,
    icon: def.icon,
    watermark: def.watermark,
    tier: def.tier,
    power: instance?.primaryStat?.value,
    // 0 marks untiered legacy gear — treat it the same as absent.
    gearTier: instance?.gearTier || undefined,
    quantity: item.quantity,
    itemType: def.itemType,
  };
}

function byPowerThenName(a: ItemView, b: ItemView): number {
  return (b.power ?? 0) - (a.power ?? 0) || a.name.localeCompare(b.name);
}

export function buildInventoryView(profile: DestinyFullProfile, defs: ItemDefs): InventoryView {
  const instances = profile.itemComponents.instances.data ?? {};
  const equipment = profile.characterEquipment.data ?? {};
  const inventories = profile.characterInventories.data ?? {};

  const characters: CharacterInfo[] = Object.entries(profile.characters.data ?? {})
    .sort(([, a], [, b]) => Date.parse(b.dateLastPlayed) - Date.parse(a.dateLastPlayed))
    .map(([characterId, character]) => ({ characterId, character }));

  const vaultItems = (profile.profileInventory.data?.items ?? []).filter(
    (i) => i.bucketHash === VAULT_BUCKET,
  );
  const vaultByBucket = new Map<number, ItemView[]>(GEAR_BUCKETS.map(({ hash }) => [hash, []]));
  const otherVault: ItemView[] = [];
  for (const item of vaultItems) {
    const view = toItemView(item, defs, instances);
    (vaultByBucket.get(defs.get(item.itemHash)?.bucket ?? 0) ?? otherVault).push(view);
  }

  const rows: BucketRow[] = GEAR_BUCKETS.map(({ hash, label }) => ({
    hash,
    label,
    perCharacter: characters.map(({ characterId }) => {
      const equippedItem = (equipment[characterId]?.items ?? []).find(
        (i) => i.bucketHash === hash,
      );
      const stored = (inventories[characterId]?.items ?? [])
        .filter((i) => i.bucketHash === hash)
        .map((i) => toItemView(i, defs, instances))
        .sort(byPowerThenName);
      return {
        equipped: equippedItem ? toItemView(equippedItem, defs, instances) : undefined,
        stored,
      };
    }),
    vault: (vaultByBucket.get(hash) ?? []).sort(byPowerThenName),
  }));

  const postmaster: PostmasterCell[] = characters.map(({ characterId }) => {
    const items = inventories[characterId]?.items ?? [];
    return {
      engrams: items
        .filter((i) => i.bucketHash === ENGRAM_BUCKET)
        .map((i) => toItemView(i, defs, instances)),
      lostItems: items
        .filter((i) => i.bucketHash === POSTMASTER_BUCKET)
        .map((i) => toItemView(i, defs, instances)),
    };
  });

  return {
    characters,
    postmaster,
    rows,
    otherVault: otherVault.sort(byPowerThenName),
    vaultTotal: vaultItems.length,
  };
}
