import { buildPerkIndex, buildSheetIndex, evaluateRoll, normalizeName } from './rolls';
import type { SheetPerk, SheetWeapon, SheetWeaponColumns } from './rolls';

function columns(overrides: Partial<SheetWeaponColumns>): SheetWeaponColumns {
  return { barrel: [], mag: [], perk1: [], perk2: [], origin: [], ...overrides };
}

function weapon(overrides: Partial<SheetWeapon>): SheetWeapon {
  return {
    name: 'Test Weapon',
    type: 'Hand Cannon',
    enhanceable: false,
    columns: columns({}),
    tier: 'S',
    ...overrides,
  };
}

describe('normalizeName', () => {
  it('is case, whitespace, and apostrophe insensitive', () => {
    expect(normalizeName("Zaouli’s  Bane ")).toBe("zaouli's bane");
  });

  it('folds adept-style variants into the base name', () => {
    expect(normalizeName('Apex Predator (Adept)')).toBe('apex predator');
    expect(normalizeName('Fatebringer (Timelost)')).toBe('fatebringer');
    expect(normalizeName('Abyss Defiant (Harrowed)')).toBe('abyss defiant');
  });
});

describe('buildSheetIndex', () => {
  it('indexes by normalized name and keeps the first entry on duplicates', () => {
    const first = weapon({ name: 'Word of Crota', tier: 'S' });
    const second = weapon({ name: 'Word of Crota', tier: 'B' });
    const index = buildSheetIndex([first, second]);
    expect(index.get('word of crota')).toBe(first);
    expect(index.size).toBe(1);
  });
});

describe('evaluateRoll', () => {
  const sheet = weapon({
    columns: columns({
      barrel: ['Fluted Barrel'],
      mag: ['Alloy Magazine'],
      perk1: ['Repulsor Brace', 'Shoot to Loot'],
      perk2: ['Destabilizing Rounds', 'Explosive Payload'],
      origin: ["Forge's Kin"],
    }),
  });

  it('flags a god roll when both trait columns match distinct sockets', () => {
    const result = evaluateRoll(
      [
        ['Fluted Barrel', 'Corkscrew Rifling'],
        ['Alloy Magazine'],
        ['Repulsor Brace', 'Outlaw'],
        ['Destabilizing Rounds', 'Frenzy'],
        ["Forge's Kin"],
      ],
      sheet,
    );
    expect(result.isGodRoll).toBe(true);
    expect(result).toMatchObject({
      perk1Match: true,
      perk2Match: true,
      barrelMatch: true,
      magMatch: true,
      originMatch: true,
    });
  });

  it('is not a god roll when both columns only match the same socket', () => {
    const result = evaluateRoll([['Repulsor Brace', 'Destabilizing Rounds']], sheet);
    expect(result.perk1Match).toBe(true);
    expect(result.perk2Match).toBe(true);
    expect(result.isGodRoll).toBe(false);
  });

  it('resolves overlapping matches when a distinct assignment exists', () => {
    // Socket 0 satisfies both columns, socket 1 satisfies only perk2 —
    // assigning perk1→0 and perk2→1 works.
    const result = evaluateRoll(
      [
        ['Repulsor Brace', 'Destabilizing Rounds'],
        ['Explosive Payload'],
      ],
      sheet,
    );
    expect(result.isGodRoll).toBe(true);
  });

  it('matches names case- and apostrophe-insensitively', () => {
    const result = evaluateRoll([['REPULSOR BRACE'], ['destabilizing rounds']], sheet);
    expect(result.isGodRoll).toBe(true);
  });

  it('requires only the populated column when the sheet lists one trait column', () => {
    const single = weapon({ columns: columns({ perk1: ['Eager Edge'] }) });
    expect(evaluateRoll([['Eager Edge']], single).isGodRoll).toBe(true);
    expect(evaluateRoll([['Chain Reaction']], single).isGodRoll).toBe(false);
  });

  it('handles rolls with no socket data', () => {
    const result = evaluateRoll(undefined, sheet);
    expect(result.isGodRoll).toBe(false);
    expect(result.perk1Match).toBe(false);
  });

  it('flags a perfect roll when barrel and mag also match; origin trait is optional', () => {
    const full = evaluateRoll(
      [['Fluted Barrel'], ['Alloy Magazine'], ['Repulsor Brace'], ['Destabilizing Rounds']],
      sheet,
    );
    expect(full.isPerfectRoll).toBe(true);
    expect(full.originMatch).toBe(false);
  });

  it('is not perfect when a recommended barrel or mag is missing', () => {
    const noBarrel = evaluateRoll(
      [['Corkscrew Rifling'], ['Alloy Magazine'], ['Repulsor Brace'], ['Destabilizing Rounds']],
      sheet,
    );
    expect(noBarrel.isGodRoll).toBe(true);
    expect(noBarrel.isPerfectRoll).toBe(false);
  });

  it('treats empty barrel/mag recommendations as satisfied for perfection', () => {
    const traitsOnly = weapon({
      columns: columns({ perk1: ['Repulsor Brace'], perk2: ['Destabilizing Rounds'] }),
    });
    const result = evaluateRoll([['Repulsor Brace'], ['Destabilizing Rounds']], traitsOnly);
    expect(result.isPerfectRoll).toBe(true);
  });
});

describe('buildPerkIndex', () => {
  it('indexes perk ratings by normalized name', () => {
    const perk: SheetPerk = {
      name: "Fourth Time's the Charm",
      tags: ['overflow', 'ammo'],
      description: 'nearly doubles total damage',
      rank: 4,
      tier: 'S',
    };
    const index = buildPerkIndex([perk]);
    expect(index.get(normalizeName('Fourth Time’s The Charm'))).toBe(perk);
  });
});
