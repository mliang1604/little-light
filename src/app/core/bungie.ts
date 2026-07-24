export const BUNGIE_ROOT = 'https://www.bungie.net';
export const BUNGIE_API = `${BUNGIE_ROOT}/Platform`;

export interface BungieEnvelope<T> {
  readonly Response: T;
  readonly ErrorCode: number;
  readonly Message: string;
}

export interface UserInfoCard {
  readonly membershipType: number;
  readonly membershipId: string;
  readonly bungieGlobalDisplayName: string;
  readonly bungieGlobalDisplayNameCode?: number;
  readonly crossSaveOverride: number;
  readonly applicableMembershipTypes: readonly number[];
}

export interface DestinyCharacter {
  readonly characterId: string;
  readonly classType: number;
  readonly raceType: number;
  readonly light: number;
  readonly emblemPath: string;
  readonly emblemBackgroundPath: string;
  readonly minutesPlayedTotal: string;
  readonly dateLastPlayed: string;
}

export interface DestinyProfile {
  readonly profile: {
    readonly data?: { readonly userInfo: UserInfoCard; readonly dateLastPlayed: string };
  };
  readonly characters: { readonly data?: Readonly<Record<string, DestinyCharacter>> };
}

export interface DestinyItemComponent {
  readonly itemHash: number;
  readonly itemInstanceId?: string;
  readonly quantity: number;
  readonly bucketHash: number;
}

export interface DestinyItemInstance {
  readonly primaryStat?: { readonly value: number };
  readonly damageType?: number;
  /** Edge of Fate gear tier 1–5; 0 on untiered legacy gear. */
  readonly gearTier?: number;
}

export interface DestinyItemList {
  readonly items: readonly DestinyItemComponent[];
}

export interface DestinyItemStatsComponent {
  readonly stats: Readonly<Record<string, { readonly statHash: number; readonly value: number }>>;
}

export interface DestinyItemSocket {
  readonly plugHash?: number;
  readonly isEnabled: boolean;
  readonly isVisible?: boolean;
}

export interface DestinyItemSocketsComponent {
  readonly sockets: readonly DestinyItemSocket[];
}

export interface DestinyFullProfile extends DestinyProfile {
  readonly profileInventory: { readonly data?: DestinyItemList };
  readonly characterInventories: { readonly data?: Readonly<Record<string, DestinyItemList>> };
  readonly characterEquipment: { readonly data?: Readonly<Record<string, DestinyItemList>> };
  readonly itemComponents: {
    readonly instances: { readonly data?: Readonly<Record<string, DestinyItemInstance>> };
    readonly stats?: { readonly data?: Readonly<Record<string, DestinyItemStatsComponent>> };
    readonly sockets?: { readonly data?: Readonly<Record<string, DestinyItemSocketsComponent>> };
  };
}

export interface CurrentUserMemberships {
  readonly destinyMemberships: readonly UserInfoCard[];
  readonly primaryMembershipId?: string;
  readonly bungieNetUser: {
    readonly membershipId: string;
    readonly uniqueName: string;
    readonly displayName: string;
  };
}

export interface BungieTokens {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
  readonly membership_id: string;
}

export class BungieApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'BungieApiError';
  }
}

export const CLASS_NAMES: Readonly<Record<number, string>> = {
  0: 'Titan',
  1: 'Hunter',
  2: 'Warlock',
};

export const RACE_NAMES: Readonly<Record<number, string>> = {
  0: 'Human',
  1: 'Awoken',
  2: 'Exo',
};

export const PLATFORM_NAMES: Readonly<Record<number, string>> = {
  1: 'Xbox',
  2: 'PlayStation',
  3: 'Steam',
  4: 'Battle.net',
  5: 'Stadia',
  6: 'Epic Games',
};

export function parseBungieName(
  input: string,
): { displayName: string; displayNameCode: number } | null {
  const hashIndex = input.lastIndexOf('#');
  if (hashIndex <= 0) return null;
  const displayName = input.slice(0, hashIndex).trim();
  const codeText = input.slice(hashIndex + 1).trim();
  if (!displayName || !/^\d{1,4}$/.test(codeText)) return null;
  return { displayName, displayNameCode: Number(codeText) };
}

export function formatNameCode(code: number | undefined): string {
  return code == null ? '' : `#${String(code).padStart(4, '0')}`;
}

/** Cross-save accounts list one membership per platform; prefer the primary. */
export function pickPrimaryMembership(
  memberships: readonly UserInfoCard[],
  primaryMembershipId?: string,
): UserInfoCard | null {
  if (memberships.length === 0) return null;
  return (
    memberships.find((m) => m.membershipId === primaryMembershipId) ??
    memberships.find((m) => m.membershipType === m.crossSaveOverride) ??
    memberships[0] ??
    null
  );
}
