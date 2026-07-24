// Converts the community "Destiny 2: Endgame Analysis" spreadsheet into the
// trimmed JSON the app ships (public/endgame-analysis.json).
//
// Usage: node scripts/convert-endgame-analysis.mjs [path-to-xlsx]
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const DEFAULT_INPUT = 'C:\\Users\\mlian\\Downloads\\Destiny 2_ Endgame Analysis.xlsx';
const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'endgame-analysis.json');

/** Live weapon tabs and the archetype label they represent. */
const WEAPON_TABS = {
  Autos: 'Auto Rifle',
  Bows: 'Bow',
  HCs: 'Hand Cannon',
  Pulses: 'Pulse Rifle',
  Scouts: 'Scout Rifle',
  Sidearms: 'Sidearm',
  SMGs: 'Submachine Gun',
  BGLs: 'Breech Grenade Launcher',
  Fusions: 'Fusion Rifle',
  Glaives: 'Glaive',
  Shotguns: 'Shotgun',
  Snipers: 'Sniper Rifle',
  'Rocket Sidearms': 'Rocket Sidearm',
  Traces: 'Trace Rifle',
  HGLs: 'Heavy Grenade Launcher',
  LFRs: 'Linear Fusion Rifle',
  LMGs: 'Machine Gun',
  Rockets: 'Rocket Launcher',
  Swords: 'Sword',
  Other: 'Other',
};

const input = process.argv[2] ?? DEFAULT_INPUT;
const workbook = XLSX.read(readFileSync(input), { type: 'buffer' });

function sheetRows(name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) return null;
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

/** Newline-separated cell -> list of trimmed options; N/A and None mean empty. */
function splitCell(value) {
  return clean(value)
    .split('\n')
    .map((part) => part.trim())
    .filter((part) => part && part !== 'N/A' && part !== 'None');
}

function headerIndex(rows) {
  const rowIndex = rows.findIndex((row) => row.some((cell) => clean(cell) === 'Name'));
  if (rowIndex < 0) return null;
  const map = new Map();
  rows[rowIndex].forEach((cell, column) => {
    const text = clean(cell);
    if (text) map.set(text, column);
  });
  return { rowIndex, map };
}

function parseWeaponTab(tab, type) {
  const rows = sheetRows(tab);
  if (!rows) {
    console.warn(`!! missing tab: ${tab}`);
    return [];
  }
  const header = headerIndex(rows);
  if (!header) {
    console.warn(`!! no header row in tab: ${tab}`);
    return [];
  }
  const cell = (row, name) => (header.map.has(name) ? row[header.map.get(name)] : null);

  const weapons = [];
  for (const row of rows.slice(header.rowIndex + 1)) {
    const nameLines = splitCell(cell(row, 'Name'));
    if (nameLines.length === 0) continue;
    const rank = Number(clean(cell(row, '#')));
    weapons.push({
      name: nameLines[0],
      ...(nameLines.length > 1 ? { variant: nameLines.slice(1).join(' · ') } : {}),
      type,
      season: clean(cell(row, 'Season')) || undefined,
      energy: clean(cell(row, 'Energy')) || undefined,
      frame: clean(cell(row, 'Frame')) || undefined,
      source: clean(cell(row, 'Source')) || undefined,
      enhanceable: clean(cell(row, '⬆️')) === 'Yes',
      columns: {
        barrel: splitCell(cell(row, 'Barrel')),
        mag: splitCell(cell(row, 'Mag')),
        perk1: splitCell(cell(row, 'Perk 1')),
        perk2: splitCell(cell(row, 'Perk 2')),
        origin: splitCell(cell(row, 'Origin Trait')),
      },
      notes: clean(cell(row, 'Notes')) || undefined,
      rank: Number.isFinite(rank) && rank > 0 ? rank : undefined,
      tier: clean(cell(row, 'Tier')) || undefined,
    });
  }
  return weapons;
}

/** Perks and Origin Traits tabs share the Name/Tags/Description/Rank/Tier shape. */
function parsePerksTab(tab) {
  const rows = sheetRows(tab);
  if (!rows) {
    console.warn(`!! missing tab: ${tab}`);
    return [];
  }
  const header = headerIndex(rows);
  if (!header) return [];
  const cell = (row, name) => (header.map.has(name) ? row[header.map.get(name)] : null);

  const perks = [];
  for (const row of rows.slice(header.rowIndex + 1)) {
    const name = clean(cell(row, 'Name'));
    if (!name) continue;
    const rank = Number(clean(cell(row, 'Rank')));
    perks.push({
      name,
      tags: splitCell(cell(row, 'Tags')),
      description: clean(cell(row, 'Description')) || undefined,
      rank: Number.isFinite(rank) && rank > 0 ? rank : undefined,
      tier: clean(cell(row, 'Tier')) || undefined,
    });
  }
  return perks;
}

function parseShoppingList() {
  const rows = sheetRows('Shopping List');
  if (!rows) {
    console.warn('!! missing tab: Shopping List');
    return [];
  }
  const header = headerIndex(rows);
  if (!header) return [];
  const cell = (row, name) => (header.map.has(name) ? row[header.map.get(name)] : null);

  const items = [];
  for (const row of rows.slice(header.rowIndex + 1)) {
    const name = clean(cell(row, 'Name'));
    if (!name) continue;
    items.push({
      role: clean(cell(row, 'Role')),
      name,
      source: clean(cell(row, 'Source')),
      priority: clean(cell(row, 'Priority')) || 'unspecified',
      col1: splitCell(cell(row, 'Column 1')),
      col2: splitCell(cell(row, 'Column 2')),
      alternatives: splitCell(cell(row, 'Alternatives')),
    });
  }
  return items;
}

const weapons = [];
for (const [tab, type] of Object.entries(WEAPON_TABS)) {
  const parsed = parseWeaponTab(tab, type);
  console.log(`${tab.padEnd(16)} ${String(parsed.length).padStart(3)} weapons`);
  weapons.push(...parsed);
}
const shoppingList = parseShoppingList();
const perks = [...parsePerksTab('Perks'), ...parsePerksTab('Origin Traits')];

const data = {
  generatedAt: new Date().toISOString(),
  sourceFile: basename(input),
  weaponCount: weapons.length,
  weapons,
  shoppingList,
  perks,
};

writeFileSync(OUTPUT, JSON.stringify(data, null, 1));
console.log(
  `\ntotal: ${weapons.length} weapons, ${shoppingList.length} shopping items, ${perks.length} perks`,
);
console.log(`wrote: ${OUTPUT}`);
