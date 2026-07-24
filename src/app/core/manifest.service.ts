import { Injectable, inject, signal } from '@angular/core';
import { BUNGIE_ROOT, BungieApiError } from './bungie';
import { BungieApiService } from './bungie-api.service';
import { idbGet, idbSet } from './idb';

/** Trimmed DestinyInventoryItemLiteDefinition — just what the UI renders. */
export interface ItemDefLite {
  readonly name: string;
  readonly icon?: string;
  readonly tier: number;
  readonly bucket: number;
  readonly itemType: string;
  readonly watermark?: string;
}

export type ItemDefs = ReadonlyMap<number, ItemDefLite>;
export type StatNames = ReadonlyMap<number, string>;

export interface LoadedDefs {
  readonly items: ItemDefs;
  readonly statNames: StatNames;
}

export type ManifestState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'downloading'; readonly receivedMb: number }
  | { readonly kind: 'processing' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'error'; readonly message: string };

interface RawItemDef {
  readonly displayProperties?: { readonly name?: string; readonly icon?: string };
  readonly inventory?: { readonly tierType?: number; readonly bucketTypeHash?: number };
  readonly itemTypeDisplayName?: string;
  readonly iconWatermark?: string;
}

interface RawStatDef {
  readonly displayProperties?: { readonly name?: string };
}

const META_KEY = 'manifest-meta';
const ITEM_DEFS_KEY = 'item-defs';
const STAT_DEFS_KEY = 'stat-defs';
const PROGRESS_STEP_BYTES = 2 * 1024 * 1024;

@Injectable({ providedIn: 'root' })
export class ManifestService {
  private readonly api = inject(BungieApiService);

  readonly state = signal<ManifestState>({ kind: 'idle' });

  private loaded: LoadedDefs | null = null;
  private inflight: Promise<LoadedDefs> | null = null;

  /** Resolves the definition tables, downloading and caching them if needed. */
  load(): Promise<LoadedDefs> {
    if (this.loaded) return Promise.resolve(this.loaded);
    this.inflight ??= this.loadInner()
      .then((defs) => {
        this.loaded = defs;
        this.state.set({ kind: 'ready' });
        return defs;
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to load the item database.';
        this.state.set({ kind: 'error', message });
        this.inflight = null;
        throw err;
      });
    return this.inflight;
  }

  private async loadInner(): Promise<LoadedDefs> {
    this.state.set({ kind: 'checking' });
    const info = await this.api.getManifestInfo();

    const cachedMeta = await idbGet<{ version: string }>(META_KEY);
    if (cachedMeta?.version === info.version) {
      const [items, statNames] = await Promise.all([
        idbGet<Map<number, ItemDefLite>>(ITEM_DEFS_KEY),
        idbGet<Map<number, string>>(STAT_DEFS_KEY),
      ]);
      if (items && items.size > 0 && statNames && statNames.size > 0) {
        return { items, statNames };
      }
    }

    const statNames = trimStatDefs(await fetchJson<Record<string, RawStatDef>>(
      BUNGIE_ROOT + info.statDefPath,
    ));
    const rawItems = await this.download(BUNGIE_ROOT + info.itemLitePath);
    this.state.set({ kind: 'processing' });
    const items = trimDefs(rawItems);
    await idbSet(ITEM_DEFS_KEY, items);
    await idbSet(STAT_DEFS_KEY, statNames);
    await idbSet(META_KEY, { version: info.version });
    return { items, statNames };
  }

  private async download(url: string): Promise<Record<string, RawItemDef>> {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new BungieApiError(`Item database download failed (${response.status})`);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    let lastReported = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (received - lastReported >= PROGRESS_STEP_BYTES) {
        lastReported = received;
        this.state.set({ kind: 'downloading', receivedMb: received / 1048576 });
      }
    }
    const buffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(buffer)) as Record<string, RawItemDef>;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new BungieApiError(`Definition download failed (${response.status})`);
  }
  return (await response.json()) as T;
}

function trimDefs(raw: Readonly<Record<string, RawItemDef>>): ItemDefs {
  const map = new Map<number, ItemDefLite>();
  for (const [hash, def] of Object.entries(raw)) {
    map.set(Number(hash), {
      name: def.displayProperties?.name || `#${hash}`,
      icon: def.displayProperties?.icon,
      tier: def.inventory?.tierType ?? 0,
      bucket: def.inventory?.bucketTypeHash ?? 0,
      itemType: def.itemTypeDisplayName ?? '',
      watermark: def.iconWatermark,
    });
  }
  return map;
}

function trimStatDefs(raw: Readonly<Record<string, RawStatDef>>): StatNames {
  const map = new Map<number, string>();
  for (const [hash, def] of Object.entries(raw)) {
    const name = def.displayProperties?.name;
    if (name) map.set(Number(hash), name);
  }
  return map;
}
