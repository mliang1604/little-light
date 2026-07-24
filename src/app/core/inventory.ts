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

export interface BucketView {
  readonly hash: number;
  readonly label: string;
  readonly equipped?: ItemView;
  readonly stored: readonly ItemView[];
}

export interface CharacterColumn {
  readonly characterId: string;
  readonly character: DestinyCharacter;
  readonly buckets: readonly BucketView[];
}

export interface VaultGroup {
  readonly label: string;
  readonly items: readonly ItemView[];
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

export function buildCharacterColumns(
  profile: DestinyFullProfile,
  defs: ItemDefs,
): CharacterColumn[] {
  const characters = profile.characters.data ?? {};
  const instances = profile.itemComponents.instances.data ?? {};
  const equipment = profile.characterEquipment.data ?? {};
  const inventories = profile.characterInventories.data ?? {};

  return Object.entries(characters)
    .sort(([, a], [, b]) => Date.parse(b.dateLastPlayed) - Date.parse(a.dateLastPlayed))
    .map(([characterId, character]) => {
      const equipped = equipment[characterId]?.items ?? [];
      const carried = inventories[characterId]?.items ?? [];
      const buckets = GEAR_BUCKETS.map(({ hash, label }) => {
        const equippedItem = equipped.find((i) => i.bucketHash === hash);
        const stored = carried
          .filter((i) => i.bucketHash === hash)
          .map((i) => toItemView(i, defs, instances))
          .sort(byPowerThenName);
        return {
          hash,
          label,
          equipped: equippedItem ? toItemView(equippedItem, defs, instances) : undefined,
          stored,
        };
      });
      return { characterId, character, buckets };
    });
}

export function buildVaultGroups(profile: DestinyFullProfile, defs: ItemDefs): VaultGroup[] {
  const instances = profile.itemComponents.instances.data ?? {};
  const vaultItems = (profile.profileInventory.data?.items ?? []).filter(
    (i) => i.bucketHash === VAULT_BUCKET,
  );

  const groups = new Map<number, ItemView[]>(GEAR_BUCKETS.map(({ hash }) => [hash, []]));
  const other: ItemView[] = [];
  for (const item of vaultItems) {
    const view = toItemView(item, defs, instances);
    const def = defs.get(item.itemHash);
    (groups.get(def?.bucket ?? 0) ?? other).push(view);
  }

  const result: VaultGroup[] = [];
  for (const { hash, label } of GEAR_BUCKETS) {
    const items = groups.get(hash) ?? [];
    if (items.length > 0) result.push({ label, items: [...items].sort(byPowerThenName) });
  }
  if (other.length > 0) result.push({ label: 'Other', items: [...other].sort(byPowerThenName) });
  return result;
}
