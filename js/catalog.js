/** Auto-generated from tools/extract_user_enemy_sprites.py — shop / deck catalog. */
export const CATALOG = [
  { id: 'mk3_interceptor', name: 'MK III Interceptor', price: 40, rarity: 'common', tier: 'basic', starter: false },
  { id: 'mini_hinobunni', name: 'Mini Hinobunni', price: 45, rarity: 'common', tier: 'basic', starter: false },
  { id: 'ionregon', name: 'Ionregon Done', price: 50, rarity: 'common', tier: 'drone', starter: false },
  { id: 'gunship_alpha', name: 'Gunship Alpha', price: 70, rarity: 'uncommon', tier: 'elite', starter: false },
  { id: 'elite', name: 'Fighter Mk. II', price: 0, rarity: 'common', tier: 'elite', starter: true },
  { id: 'security_fly', name: 'Security Fly', price: 55, rarity: 'common', tier: 'swarm', starter: false },
  { id: 'basic', name: 'Sentry Bot Gamma', price: 0, rarity: 'common', tier: 'basic', starter: true },
  { id: 'drone', name: 'R-1 Sooni Donn', price: 0, rarity: 'common', tier: 'drone', starter: true },
  { id: 'tank', name: 'Armored Enforcer', price: 0, rarity: 'uncommon', tier: 'tank', starter: true },
  { id: 'missile_cruiser', name: 'Missile Cruiser', price: 90, rarity: 'uncommon', tier: 'elite', starter: false },
  { id: 'strike_fighter', name: 'Strike Fighter A', price: 75, rarity: 'uncommon', tier: 'elite', starter: false },
  { id: 'strike_fighter_b', name: 'Strike Fighter B', price: 75, rarity: 'uncommon', tier: 'elite', starter: false },
  { id: 'gorgon_mech', name: 'Gorgon Mech', price: 110, rarity: 'rare', tier: 'mech', starter: false },
  { id: 'security_eye', name: 'Security Eye', price: 100, rarity: 'rare', tier: 'golem', starter: false },
  { id: 'tracking_sentry', name: 'Tracking Sentry', price: 85, rarity: 'uncommon', tier: 'tank', starter: false },
  { id: 'sea_patrol', name: 'Sea Patrol Vessel', price: 80, rarity: 'uncommon', tier: 'tank', starter: false },
  { id: 'engineer_bot', name: 'Engineer Bot', price: 95, rarity: 'uncommon', tier: 'mech', starter: false },
  { id: 'emp_disruptor', name: 'EMP Disruptor', price: 120, rarity: 'rare', tier: 'mech', starter: false },
  { id: 'swarm', name: 'Drone Swarm Node', price: 0, rarity: 'common', tier: 'swarm', starter: true },
  { id: 'cruiser_class', name: 'Cruiser-Class', price: 130, rarity: 'rare', tier: 'tank', starter: false },
  { id: 'destroyer_class', name: 'Destroyer-Class', price: 140, rarity: 'rare', tier: 'tank', starter: false },
  { id: 'orbital_blaster', name: 'Orbital Blaster', price: 125, rarity: 'rare', tier: 'mech', starter: false },
  { id: 'heavy_sentinel_ship', name: 'Heavy Sentinel Ship', price: 135, rarity: 'rare', tier: 'mech', starter: false },
  { id: 'mech', name: 'Heavy Sentinel', price: 150, rarity: 'rare', tier: 'mech', starter: false },
  { id: 'light_cruiser', name: 'Light Cruiser', price: 145, rarity: 'rare', tier: 'mech', starter: false },
  { id: 'rapid_fire_mech', name: 'Rapid-Fire Mech', price: 160, rarity: 'rare', tier: 'mech', starter: false },
  { id: 'missile_destroyer', name: 'Missile Destroyer', price: 155, rarity: 'rare', tier: 'tank', starter: false },
  { id: 'dreadnought_c1', name: 'Dreadnought Class 1', price: 180, rarity: 'epic', tier: 'golem', starter: false },
  { id: 'golem', name: 'Dreadnought Class 2', price: 200, rarity: 'epic', tier: 'golem', starter: false },
  { id: 'cruiser_gun', name: 'Gun Cruiser', price: 170, rarity: 'rare', tier: 'tank', starter: false },
  { id: 'heavy_gunner', name: 'Heavy Gunner', price: 190, rarity: 'epic', tier: 'golem', starter: false },
  { id: 'fleet_carrier', name: 'Fleet Carrier', price: 210, rarity: 'epic', tier: 'boss', starter: false },
  { id: 'super_dreadnought', name: 'Super Dreadnought', price: 280, rarity: 'legendary', tier: 'boss', starter: false },
  { id: 'carrier_hive', name: 'Carrier Hive Ship', price: 300, rarity: 'legendary', tier: 'boss', starter: false },
  { id: 'mobile_fortress', name: 'Mobile Fortress', price: 320, rarity: 'legendary', tier: 'boss', starter: false },
  { id: 'boss', name: 'Planet Killer', price: 350, rarity: 'legendary', tier: 'boss', starter: false },
  { id: 'ai_core', name: 'Central AI Core', price: 400, rarity: 'legendary', tier: 'boss', starter: false },
];

/** Fixed order: 5 free starters always equipped at first launch. */
export const STARTER_DECK = ['basic', 'drone', 'elite', 'swarm', 'tank'];
export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((u) => [u.id, u]));
export const ALL_KIND_IDS = CATALOG.map((u) => u.id);

