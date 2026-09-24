// Asserts every catalog unit has its own, unique attack loadout (pattern set) and valid patterns.
// Usage: node tools/check_unit_attacks.mjs
import { CATALOG, UNIT_ATTACKS, ATTACK_PATTERN_INFO, loadoutPatternIds, unitIntro } from '../js/catalog.js';

const errors = [];
const seen = new Map();
const rows = [];
for (const u of CATALOG) {
  const lo = UNIT_ATTACKS[u.id];
  if (!lo) { errors.push(`missing loadout: ${u.id}`); continue; }
  if (!(lo.iv > 0.5 && lo.iv < 3)) errors.push(`bad iv ${lo.iv}: ${u.id}`);
  const pids = loadoutPatternIds(lo);
  if (pids.length < 1 || pids.length > 3) errors.push(`${u.id}: ${pids.length} patterns (want 1-3)`);
  for (const p of pids) if (!ATTACK_PATTERN_INFO[p]) errors.push(`${u.id}: unknown pattern ${p}`);
  const key = [...pids].sort().join('+');
  if (seen.has(key)) errors.push(`duplicate pattern set ${key}: ${seen.get(key)} & ${u.id}`);
  seen.set(key, u.id);
  const intro = unitIntro(u.id);
  if (intro.attack.split('／')[0] !== ATTACK_PATTERN_INFO[pids[0]].ja) errors.push(`${u.id}: chip mismatch`);
  // rough strength: sum of pattern power / interval × volleys
  const power = pids.reduce((s, p) => s + ATTACK_PATTERN_INFO[p].power, 0) / pids.length * (lo.per || 1) / lo.iv;
  rows.push({ id: u.id, tier: u.tier, price: u.price, power: +power.toFixed(2), attack: intro.attack });
}
for (const id of Object.keys(UNIT_ATTACKS)) if (!CATALOG.some((u) => u.id === id)) errors.push(`orphan loadout: ${id}`);
const attacks = new Set(rows.map((r) => r.attack));
if (attacks.size !== rows.length) errors.push(`attack texts not unique (${attacks.size}/${rows.length})`);
rows.sort((a, b) => a.price - b.price);
if (process.argv.includes('-v')) for (const r of rows) console.log(`${String(r.price).padStart(3)} ${r.tier.padEnd(5)} ${r.power.toFixed(2)} ${r.id.padEnd(26)} ${r.attack}`);
// Cheap units must stay weaker than expensive ones on average
const avg = (f) => { const a = rows.filter(f); return a.reduce((s, r) => s + r.power, 0) / a.length; };
const cheap = avg((r) => r.price <= 60), mid = avg((r) => r.price > 60 && r.price < 180), top = avg((r) => r.price >= 260);
console.log(`units=${rows.length} uniqueSets=${seen.size} avgPower cheap=${cheap.toFixed(2)} mid=${mid.toFixed(2)} boss=${top.toFixed(2)}`);
if (!(cheap < mid && mid < top)) errors.push('power does not scale with price');
if (errors.length) { console.error('FAIL\n' + errors.join('\n')); process.exit(1); }
console.log('OK: all catalog units have unique attack loadouts');
