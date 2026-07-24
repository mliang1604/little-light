import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { BUNGIE_API, BungieApiError, parseBungieName, pickPrimaryMembership } from './bungie';
import type {
  BungieEnvelope,
  CurrentUserMemberships,
  DestinyFullProfile,
  DestinyProfile,
  SocketCategoryInfo,
  UserInfoCard,
} from './bungie';

/** DestinyComponentType values: 100 = Profiles, 200 = Characters. */
const PROFILE_COMPONENTS = '100,200';

/**
 * Adds 102 ProfileInventories (vault), 201 CharacterInventories, 205 CharacterEquipment,
 * 300 ItemInstances, 304 ItemStats, 305 ItemSockets, 310 ItemReusablePlugs.
 */
const INVENTORY_COMPONENTS = '100,102,200,201,205,300,304,305,310';

export interface ManifestInfo {
  readonly version: string;
  readonly itemLitePath: string;
  readonly statDefPath: string;
  readonly socketCategoryDefPath: string;
}

interface RawFullItemDef {
  readonly displayProperties?: { readonly description?: string };
  readonly perks?: readonly { readonly perkHash: number }[];
  readonly sockets?: {
    readonly socketCategories?: readonly SocketCategoryInfo[];
  };
}

interface RawSandboxPerkDef {
  readonly isDisplayable?: boolean;
  readonly displayProperties?: { readonly description?: string };
}

/** On-demand pieces of the full item definition that the Lite manifest strips. */
export interface ItemDefExtras {
  readonly description: string;
  /** Sandbox perks carry the real effect text for catalysts, mods, and traits. */
  readonly perkHashes: readonly number[];
  readonly socketCategories: readonly SocketCategoryInfo[];
}

interface RawManifestResponse {
  readonly version: string;
  readonly jsonWorldComponentContentPaths: Readonly<Record<string, Record<string, string>>>;
}

@Injectable({ providedIn: 'root' })
export class BungieApiService {
  private readonly http = inject(HttpClient);
  private readonly itemExtrasCache = new Map<number, Promise<ItemDefExtras>>();
  private readonly sandboxPerkCache = new Map<number, Promise<string>>();

  async searchPlayer(bungieName: string): Promise<UserInfoCard | null> {
    const parsed = parseBungieName(bungieName);
    if (!parsed) {
      throw new BungieApiError('Enter a full Bungie Name, e.g. "Guardian#1234".');
    }
    const memberships = await this.request<UserInfoCard[]>(
      'POST',
      '/Destiny2/SearchDestinyPlayerByBungieName/-1/',
      parsed,
    );
    return pickPrimaryMembership(memberships);
  }

  getProfile(membershipType: number, membershipId: string): Promise<DestinyProfile> {
    return this.request<DestinyProfile>(
      'GET',
      `/Destiny2/${membershipType}/Profile/${membershipId}/?components=${PROFILE_COMPONENTS}`,
    );
  }

  getCurrentUserMemberships(): Promise<CurrentUserMemberships> {
    return this.request<CurrentUserMemberships>('GET', '/User/GetMembershipsForCurrentUser/');
  }

  /** Full inventory for the signed-in player — needs the ReadDestinyInventoryAndVault scope. */
  getFullProfile(membershipType: number, membershipId: string): Promise<DestinyFullProfile> {
    return this.request<DestinyFullProfile>(
      'GET',
      `/Destiny2/${membershipType}/Profile/${membershipId}/?components=${INVENTORY_COMPONENTS}`,
    );
  }

  async getManifestInfo(): Promise<ManifestInfo> {
    const manifest = await this.request<RawManifestResponse>('GET', '/Destiny2/Manifest/');
    const en = manifest.jsonWorldComponentContentPaths['en'];
    const itemLitePath = en?.['DestinyInventoryItemLiteDefinition'];
    const statDefPath = en?.['DestinyStatDefinition'];
    const socketCategoryDefPath = en?.['DestinySocketCategoryDefinition'];
    if (!itemLitePath || !statDefPath || !socketCategoryDefPath) {
      throw new BungieApiError('Manifest is missing English definitions.');
    }
    return { version: manifest.version, itemLitePath, statDefPath, socketCategoryDefPath };
  }

  /**
   * Description and socket layout for one item from its full definition (the Lite
   * manifest strips both). Cached per hash; each unique item costs one request.
   */
  getItemExtras(itemHash: number): Promise<ItemDefExtras> {
    let cached = this.itemExtrasCache.get(itemHash);
    if (!cached) {
      cached = this.request<RawFullItemDef>(
        'GET',
        `/Destiny2/Manifest/DestinyInventoryItemDefinition/${itemHash}/`,
      )
        .then((def) => ({
          description: def.displayProperties?.description ?? '',
          perkHashes: (def.perks ?? []).map((perk) => perk.perkHash),
          socketCategories: def.sockets?.socketCategories ?? [],
        }))
        .catch((err: unknown) => {
          this.itemExtrasCache.delete(itemHash);
          throw err;
        });
      this.itemExtrasCache.set(itemHash, cached);
    }
    return cached;
  }

  /** Displayable sandbox-perk description, or '' when hidden. Cached per hash. */
  getSandboxPerkDescription(perkHash: number): Promise<string> {
    let cached = this.sandboxPerkCache.get(perkHash);
    if (!cached) {
      cached = this.request<RawSandboxPerkDef>(
        'GET',
        `/Destiny2/Manifest/DestinySandboxPerkDefinition/${perkHash}/`,
      )
        .then((def) =>
          def.isDisplayable === false ? '' : (def.displayProperties?.description ?? ''),
        )
        .catch((err: unknown) => {
          this.sandboxPerkCache.delete(perkHash);
          throw err;
        });
      this.sandboxPerkCache.set(perkHash, cached);
    }
    return cached;
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    if (!environment.bungieApiKey) {
      throw new BungieApiError('No Bungie API key configured — see the README for setup.');
    }
    let envelope: BungieEnvelope<T>;
    try {
      envelope = await firstValueFrom(
        this.http.request<BungieEnvelope<T>>(method, `${BUNGIE_API}${path}`, { body }),
      );
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        const message = (err.error as Partial<BungieEnvelope<unknown>> | null)?.Message;
        throw new BungieApiError(message ?? `Bungie API request failed (${err.status})`, err.status);
      }
      throw err;
    }
    if (envelope.ErrorCode !== 1) {
      throw new BungieApiError(envelope.Message || 'Bungie API error');
    }
    return envelope.Response;
  }
}
