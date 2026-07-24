import type {
  DestinyCharacter,
  DestinyFullProfile,
  DestinyItemComponent,
  DestinyItemInstance,
  SocketCategoryInfo,
} from './bungie';
import type { ItemDefLite, ItemDefs, StatNames } from './manifest.service';

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

export interface ItemStatView {
  readonly name: string;
  readonly value: number;
  /** Present only for 0–100 gauges; absolute stats (RPM, magazine…) render as numbers. */
  readonly barPercent?: number;
}

export interface ItemPlugView {
  readonly hash: number;
  readonly name: string;
  readonly icon?: string;
}

export interface PerkOptionView extends ItemPlugView {
  /** Whether this option is the one currently plugged. */
  readonly active: boolean;
}

export interface ItemDetailView {
  readonly item: ItemView;
  readonly stats: readonly ItemStatView[];
  /** One column per perk socket, DIM-style; each column lists that socket's options. */
  readonly perkColumns: readonly (readonly PerkOptionView[])[];
  readonly mods: readonly ItemPlugView[];
}

/** DIM's display order: weapon archetype stats first, then armor stats. */
const STAT_ORDER: readonly number[] = [
  4284893193, // Rounds Per Minute
  2961396640, // Charge Time
  447667954, // Draw Time
  3614673599, // Blast Radius
  2523465841, // Velocity
  4043523819, // Impact
  1240592695, // Range
  155624089, // Stability
  943549884, // Handling
  4188031367, // Reload Speed
  1345609583, // Aim Assistance
  2714457168, // Airborne Effectiveness
  3555269338, // Zoom
  2715839340, // Recoil Direction
  3871231066, // Magazine
  392767087, // Health
  4244567218, // Melee
  1735777505, // Grenade
  144602215, // Super
  1943323491, // Class
  2996146975, // Weapons
];

const STAT_ORDER_INDEX = new Map(STAT_ORDER.map((hash, index) => [hash, index]));

/** Absolute values that read as numbers, not 0–100 gauges. */
const NO_BAR_STATS = new Set([4284893193, 3871231066, 2715839340]);

/** Socket categories whose sockets render as perk columns rather than mods. */
const PERK_CATEGORY_PATTERN = /perk|trait|intrinsic/i;

export function buildItemDetail(
  item: ItemView,
  profile: DestinyFullProfile,
  defs: ItemDefs,
  statNames: StatNames,
  socketCategories: readonly SocketCategoryInfo[],
  socketCategoryNames: ReadonlyMap<number, string>,
): ItemDetailView {
  const instanceStats = item.instanceId
    ? (profile.itemComponents.stats?.data?.[item.instanceId]?.stats ?? {})
    : {};
  const stats = Object.values(instanceStats)
    .map(({ statHash, value }) => ({
      order: STAT_ORDER_INDEX.get(statHash) ?? STAT_ORDER.length,
      stat: {
        name: statNames.get(statHash) ?? `Stat ${statHash}`,
        value,
        barPercent:
          NO_BAR_STATS.has(statHash) || value > 100
            ? undefined
            : Math.max(0, Math.min(value, 100)),
      },
    }))
    .sort((a, b) => a.order - b.order || a.stat.name.localeCompare(b.stat.name))
    .map(({ stat }) => stat);

  const sockets = item.instanceId
    ? (profile.itemComponents.sockets?.data?.[item.instanceId]?.sockets ?? [])
    : [];
  const reusable = item.instanceId
    ? (profile.itemComponents.reusablePlugs?.data?.[item.instanceId]?.plugs ?? {})
    : {};

  const perkIndexes: number[] = [];
  for (const category of socketCategories) {
    const name = socketCategoryNames.get(category.socketCategoryHash) ?? '';
    if (PERK_CATEGORY_PATTERN.test(name)) perkIndexes.push(...category.socketIndexes);
  }
  const perkIndexSet = new Set(perkIndexes);

  const perkColumns: (readonly PerkOptionView[])[] = [];
  for (const index of perkIndexes) {
    const socket = sockets[index];
    if (!socket || socket.isVisible === false) continue;
    const column: PerkOptionView[] = (reusable[String(index)] ?? []).map((option) => ({
      ...plugView(defs, option.plugItemHash),
      active: option.plugItemHash === socket.plugHash,
    }));
    if (column.length === 0 && socket.isEnabled && socket.plugHash != null) {
      column.push({ ...plugView(defs, socket.plugHash), active: true });
    }
    if (column.length > 0) perkColumns.push(column);
  }

  const mods: ItemPlugView[] = [];
  sockets.forEach((socket, index) => {
    if (perkIndexSet.has(index)) return;
    if (!socket.isEnabled || socket.isVisible === false || socket.plugHash == null) return;
    const def = defs.get(socket.plugHash);
    // Kill/Crucible trackers are cosmetic counters, not gear choices — noise here.
    if (def && /tracker/i.test(`${def.name} ${def.itemType}`)) return;
    mods.push(plugView(defs, socket.plugHash));
  });

  return { item, stats, perkColumns, mods };
}

function plugView(defs: ItemDefs, hash: number): ItemPlugView {
  const def = defs.get(hash);
  return { hash, name: def?.name ?? `#${hash}`, icon: def?.icon };
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
