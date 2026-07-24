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

const META_KEY = 'manifest-meta';
const DEFS_KEY = 'item-defs';
const PROGRESS_STEP_BYTES = 2 * 1024 * 1024;

@Injectable({ providedIn: 'root' })
export class ManifestService {
  private readonly api = inject(BungieApiService);

  readonly state = signal<ManifestState>({ kind: 'idle' });

  private defs: ItemDefs | null = null;
  private inflight: Promise<ItemDefs> | null = null;

  /** Resolves the item-definition map, downloading and caching it if needed. */
  load(): Promise<ItemDefs> {
    if (this.defs) return Promise.resolve(this.defs);
    this.inflight ??= this.loadInner()
      .then((defs) => {
        this.defs = defs;
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

  private async loadInner(): Promise<ItemDefs> {
    this.state.set({ kind: 'checking' });
    const info = await this.api.getManifestInfo();

    const cachedMeta = await idbGet<{ version: string }>(META_KEY);
    if (cachedMeta?.version === info.version) {
      const cached = await idbGet<Map<number, ItemDefLite>>(DEFS_KEY);
      if (cached && cached.size > 0) return cached;
    }

    const raw = await this.download(BUNGIE_ROOT + info.itemLitePath);
    this.state.set({ kind: 'processing' });
    const defs = trimDefs(raw);
    await idbSet(DEFS_KEY, defs);
    await idbSet(META_KEY, { version: info.version });
    return defs;
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
