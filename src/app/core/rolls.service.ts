import { Injectable, signal } from '@angular/core';
import { buildSheetIndex, evaluateRoll, normalizeName } from './rolls';
import type { EndgameAnalysis, RollAssessment, SheetIndex, SheetWeapon } from './rolls';
import type { ItemView } from './inventory';

export type RollsState = 'idle' | 'loading' | 'ready' | 'error';

/** Loads the converted Endgame Analysis JSON and scores owned rolls against it. */
@Injectable({ providedIn: 'root' })
export class RollsService {
  readonly state = signal<RollsState>('idle');

  private data: EndgameAnalysis | null = null;
  private index: SheetIndex | null = null;
  private inflight: Promise<void> | null = null;
  private readonly assessments = new Map<string, RollAssessment | null>();

  load(): Promise<void> {
    if (this.data) return Promise.resolve();
    this.inflight ??= this.loadInner().catch((err: unknown) => {
      this.state.set('error');
      this.inflight = null;
      throw err;
    });
    return this.inflight;
  }

  get analysis(): EndgameAnalysis | null {
    return this.data;
  }

  lookup(name: string): SheetWeapon | undefined {
    return this.index?.get(normalizeName(name));
  }

  /** Assessment for an owned item, memoized per instance; null when not on the sheet. */
  assess(item: ItemView): RollAssessment | null {
    if (!this.index) return null;
    const key = item.instanceId ?? `hash:${item.itemHash}`;
    const cached = this.assessments.get(key);
    if (cached !== undefined) return cached;
    const weapon = this.index.get(normalizeName(item.name));
    const assessment = weapon ? evaluateRoll(item.socketOptionNames, weapon) : null;
    this.assessments.set(key, assessment);
    return assessment;
  }

  private async loadInner(): Promise<void> {
    this.state.set('loading');
    // Relative URL resolves against the <base href>, so it works at /little-light/ too.
    const response = await fetch('endgame-analysis.json');
    if (!response.ok) {
      throw new Error(`Endgame Analysis data failed to load (${response.status})`);
    }
    this.data = (await response.json()) as EndgameAnalysis;
    this.index = buildSheetIndex(this.data.weapons);
    this.state.set('ready');
  }
}
