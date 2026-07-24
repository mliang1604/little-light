/** Types and pure logic for the "Destiny 2: Endgame Analysis" sheet data. */

export interface SheetWeaponColumns {
  readonly barrel: readonly string[];
  readonly mag: readonly string[];
  readonly perk1: readonly string[];
  readonly perk2: readonly string[];
  readonly origin: readonly string[];
}

export interface SheetWeapon {
  readonly name: string;
  readonly variant?: string;
  readonly type: string;
  readonly season?: string;
  readonly energy?: string;
  readonly frame?: string;
  readonly source?: string;
  readonly enhanceable: boolean;
  readonly columns: SheetWeaponColumns;
  readonly notes?: string;
  readonly rank?: number;
  readonly tier?: string;
}

export interface SheetShoppingItem {
  readonly role: string;
  readonly name: string;
  readonly source: string;
  readonly priority: string;
  readonly col1: readonly string[];
  readonly col2: readonly string[];
  readonly alternatives: readonly string[];
}

export interface EndgameAnalysis {
  readonly generatedAt: string;
  readonly sourceFile: string;
  readonly weaponCount: number;
  readonly weapons: readonly SheetWeapon[];
  readonly shoppingList: readonly SheetShoppingItem[];
}

const VARIANT_SUFFIX = /\s*\((adept|timelost|harrowed)\)\s*$/i;

/** Case/apostrophe/whitespace-insensitive; adept-style suffixes fold into the base name. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(VARIANT_SUFFIX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type SheetIndex = ReadonlyMap<string, SheetWeapon>;

export function buildSheetIndex(weapons: readonly SheetWeapon[]): SheetIndex {
  const index = new Map<string, SheetWeapon>();
  for (const weapon of weapons) {
    const key = normalizeName(weapon.name);
    // Duplicate names (reissues/variants): the sheet lists better entries first.
    if (!index.has(key)) index.set(key, weapon);
  }
  return index;
}

export interface RollAssessment {
  readonly weapon: SheetWeapon;
  readonly perk1Match: boolean;
  readonly perk2Match: boolean;
  readonly barrelMatch: boolean;
  readonly magMatch: boolean;
  readonly originMatch: boolean;
  readonly isGodRoll: boolean;
}

/**
 * Matches a roll's per-socket option names against the sheet's recommendations.
 * A perk counts when it is AVAILABLE on the roll (DIM wishlist convention); a
 * god roll needs both trait columns satisfied by distinct sockets.
 */
export function evaluateRoll(
  socketOptionNames: readonly (readonly string[])[] | undefined,
  weapon: SheetWeapon,
): RollAssessment {
  const sockets = (socketOptionNames ?? []).map(
    (names) => new Set(names.map((name) => normalizeName(name))),
  );
  const matchingSockets = (recommended: readonly string[]): readonly number[] => {
    const wanted = recommended.map((name) => normalizeName(name));
    const found: number[] = [];
    sockets.forEach((options, index) => {
      if (wanted.some((name) => options.has(name))) found.push(index);
    });
    return found;
  };

  const perk1Sockets = matchingSockets(weapon.columns.perk1);
  const perk2Sockets = matchingSockets(weapon.columns.perk2);
  const perk1Match = perk1Sockets.length > 0;
  const perk2Match = perk2Sockets.length > 0;

  const perk1Wanted = weapon.columns.perk1.length > 0;
  const perk2Wanted = weapon.columns.perk2.length > 0;
  let isGodRoll: boolean;
  if (perk1Wanted && perk2Wanted) {
    isGodRoll =
      perk1Match &&
      perk2Match &&
      (perk1Sockets.length > 1 ||
        perk2Sockets.length > 1 ||
        perk1Sockets[0] !== perk2Sockets[0]);
  } else if (perk1Wanted || perk2Wanted) {
    isGodRoll = perk1Wanted ? perk1Match : perk2Match;
  } else {
    isGodRoll = false;
  }

  return {
    weapon,
    perk1Match,
    perk2Match,
    barrelMatch: matchingSockets(weapon.columns.barrel).length > 0,
    magMatch: matchingSockets(weapon.columns.mag).length > 0,
    originMatch: matchingSockets(weapon.columns.origin).length > 0,
    isGodRoll,
  };
}
