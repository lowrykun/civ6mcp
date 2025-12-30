import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  DiplomaticRelation,
  DiplomaticModifier,
  MilitaryIntelligence,
  CombatRecord,
  CityProduction,
  CityFoundingStats,
  TechProgress,
  CongressVote,
  CongressResult,
  GreatPersonEvent,
  StrategicThreat,
  StrategicOpportunity,
  CivStatistics,
} from './types.js';
import { getLogsDirectory } from './paths.js';

const LOGS_PATH = getLogsDirectory();

// Log file names
const LOG_FILES = {
  DIPLOMACY: 'AI_Diplomacy.csv',
  DIPLOMACY_MODIFIERS: 'DiplomacyModifiers.csv',
  MILITARY: 'AI_Military.csv',
  COMBAT: 'CombatLog.csv',
  CITY_PRODUCTION: 'City_BuildQueue.csv',
  CITY_BUILD: 'AI_CityBuild.csv',
  TECH: 'AI_Research.csv',
  WORLD_CONGRESS: 'World_Congress.csv',
  GREAT_PEOPLE: 'Game_GreatPeople.csv',
  PLAYER_STATS: 'Player_Stats.csv',
};

// ============ Player ID Mapping ============

// Build mapping from Player_Stats.csv (has both player index and civ name)
export function buildPlayerIdMap(): Map<number, string> {
  const playerMap = new Map<number, string>();
  const statsPath = join(LOGS_PATH, LOG_FILES.PLAYER_STATS);

  if (!existsSync(statsPath)) {
    return playerMap;
  }

  const content = readFileSync(statsPath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return playerMap;

  // Get the latest turn's data to build the mapping
  // Each civ appears in order, so index = player ID
  const latestTurn = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 2) continue;

    const civName = values[1].replace('CIVILIZATION_', '');
    if (!latestTurn.has(civName)) {
      latestTurn.set(civName, latestTurn.size);
    }
  }

  // Invert: player ID -> civ name
  for (const [civName, playerId] of latestTurn) {
    playerMap.set(playerId, civName);
  }

  return playerMap;
}

// Get civilization name from player ID
function getCivName(playerId: number, playerMap: Map<number, string>): string {
  return playerMap.get(playerId) || `Player ${playerId}`;
}

// Format civilization name for display
function formatCivName(rawName: string): string {
  return rawName.split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Format enum-style names (UNIT_TANK -> Tank, BUILDING_LIBRARY -> Library)
function formatEnumName(name: string): string {
  return name
    .replace(/^(UNIT_|BUILDING_|DISTRICT_|PROJECT_|TECH_|CIVIC_|GREAT_PERSON_INDIVIDUAL_|GREAT_PERSON_CLASS_)/, '')
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Format city name (LOC_CITY_HA_NOI -> Ha Noi, LOC_CITY_NAME_GEELONG -> Geelong)
function formatCityName(locName: string): string {
  return locName
    .replace(/^LOC_CITY_NAME_/, '')  // Must come before LOC_CITY_
    .replace(/^LOC_CITY_/, '')
    .replace(/^NAME_/, '')  // Handle if NAME_ prefix remains
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ============ Diplomacy Parsing ============

export function parseDiplomacy(): DiplomaticRelation[] {
  const filePath = join(LOGS_PATH, LOG_FILES.DIPLOMACY);
  if (!existsSync(filePath)) return [];

  const playerMap = buildPlayerIdMap();
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return [];

  const relations: DiplomaticRelation[] = [];

  // Parse diplomatic relations (rows without "Threat and Trust" in Action column)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(',').map(v => v.trim());

    if (parts.length < 4) continue;

    const turn = parseInt(parts[0], 10);
    const fromPlayerId = parseInt(parts[1], 10);
    const action = parts[2];

    // Skip "Threat and Trust" rows - we'll parse those separately
    if (action === 'Threat and Trust') continue;

    // Parse relationship data from columns 4+ (player IDs 0, 1, 2, ...)
    for (let col = 4; col < parts.length; col++) {
      const cellValue = parts[col];
      if (!cellValue || cellValue === '') continue;

      // Format: "score:DIPLO_STATE_XXX" e.g., "-23:DIPLO_STATE_UNFRIENDLY"
      const match = cellValue.match(/(-?\d+):DIPLO_STATE_(\w+)/);
      if (!match) continue;

      const score = parseInt(match[1], 10);
      const state = match[2];
      const toPlayerId = col - 4; // Column offset to player ID

      // Skip self-relations
      if (fromPlayerId === toPlayerId) continue;

      relations.push({
        fromCiv: formatCivName(getCivName(fromPlayerId, playerMap)),
        toCiv: formatCivName(getCivName(toPlayerId, playerMap)),
        fromPlayerId,
        toPlayerId,
        state,
        score,
        threat: 0,
        trust: 0,
      });
    }
  }

  // Now parse "Threat and Trust" rows to fill in those values
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(',').map(v => v.trim());

    if (parts.length < 4 || parts[2] !== 'Threat and Trust') continue;

    const fromPlayerId = parseInt(parts[1], 10);

    for (let col = 4; col < parts.length; col++) {
      const cellValue = parts[col];
      if (!cellValue || cellValue === '') continue;

      // Format: "threat:rank:trust" e.g., "60.16:1:32.00"
      const match = cellValue.match(/([\d.]+):(\d+):([\d.]+)/);
      if (!match) continue;

      const threat = parseFloat(match[1]);
      const trust = parseFloat(match[3]);
      const toPlayerId = col - 4;

      // Find and update the corresponding relation
      const relation = relations.find(
        r => r.fromPlayerId === fromPlayerId && r.toPlayerId === toPlayerId
      );
      if (relation) {
        relation.threat = threat;
        relation.trust = trust;
      }
    }
  }

  return relations;
}

export function parseDiplomacyModifiers(): DiplomaticModifier[] {
  const filePath = join(LOGS_PATH, LOG_FILES.DIPLOMACY_MODIFIERS);
  if (!existsSync(filePath)) return [];

  const playerMap = buildPlayerIdMap();
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return [];

  const modifiers: DiplomaticModifier[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 7) continue;

    const turn = parseInt(values[0], 10);
    const playerId = parseInt(values[1], 10);
    const opponentId = parseInt(values[2], 10);
    const modifier = values[3];
    const action = values[4];
    const value = parseFloat(values[5]);
    const maxValue = parseFloat(values[6]);
    const cooldownTurns = values.length > 9 ? parseInt(values[9], 10) : 0;

    modifiers.push({
      turn,
      player: formatCivName(getCivName(playerId, playerMap)),
      playerId,
      opponent: formatCivName(getCivName(opponentId, playerMap)),
      opponentId,
      modifier,
      action,
      value,
      maxValue,
      cooldownTurns,
    });
  }

  return modifiers;
}

// ============ Military Parsing ============

export function parseMilitaryIntel(): MilitaryIntelligence[] {
  const filePath = join(LOGS_PATH, LOG_FILES.MILITARY);
  if (!existsSync(filePath)) return [];

  const playerMap = buildPlayerIdMap();
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return [];

  const intel: MilitaryIntelligence[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 9) continue;

    const turn = parseInt(values[0], 10);
    const playerId = parseInt(values[1], 10);
    const regionalStrength = parseInt(values[2], 10);
    const enemyStrength = parseInt(values[3], 10);
    const otherStrength = parseInt(values[4], 10);

    // Parse explorers "current:desired" format
    const explorerParts = values[5].split(':');
    const currentExplorers = parseInt(explorerParts[0], 10) || 0;
    const desiredExplorers = parseInt(explorerParts[1], 10) || 0;

    // Skip desired explorers column (6), get fav tech (7) and combat desire (8)
    const favoriteTech = values[7] || 'NO_TECH';
    const combatDesire = parseFloat(values[8]) || 0;

    intel.push({
      turn,
      civilization: formatCivName(getCivName(playerId, playerMap)),
      playerId,
      regionalStrength,
      enemyStrength,
      otherStrength,
      combatDesire,
      favoriteTech: formatEnumName(favoriteTech),
      currentExplorers,
      desiredExplorers,
    });
  }

  return intel;
}

export function parseCombatLog(): CombatRecord[] {
  const filePath = join(LOGS_PATH, LOG_FILES.COMBAT);
  if (!existsSync(filePath)) return [];

  const playerMap = buildPlayerIdMap();
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return [];

  const records: CombatRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 14) continue;

    const turn = parseInt(values[0], 10);
    const attackerId = parseInt(values[1], 10);
    const defenderId = parseInt(values[2], 10);
    const attackerUnit = values[5] || 'UNKNOWN';
    const defenderUnit = values[6] || 'UNKNOWN';
    const attackerStrength = parseInt(values[9], 10);
    const defenderStrength = parseInt(values[10], 10);
    const attackerDamage = parseInt(values[13], 10);
    const defenderDamage = parseInt(values[12], 10);

    records.push({
      turn,
      attackerCiv: formatCivName(getCivName(attackerId, playerMap)),
      defenderCiv: formatCivName(getCivName(defenderId, playerMap)),
      attackerId,
      defenderId,
      attackerUnit: formatEnumName(attackerUnit),
      defenderUnit: formatEnumName(defenderUnit),
      attackerStrength,
      defenderStrength,
      attackerDamage,
      defenderDamage,
    });
  }

  return records;
}

// ============ Production/Tech Parsing ============

export function parseCityProduction(): CityProduction[] {
  const filePath = join(LOGS_PATH, LOG_FILES.CITY_PRODUCTION);
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return [];

  const production: CityProduction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 7) continue;

    const turn = parseInt(values[0], 10);
    const city = values[1];
    const productionPerTurn = parseFloat(values[2]);
    const currentItem = values[3];
    const currentProgress = parseFloat(values[4]);
    const productionNeeded = parseFloat(values[5]);
    const overflow = parseFloat(values[6]) || 0;

    const turnsRemaining = productionPerTurn > 0
      ? Math.ceil((productionNeeded - currentProgress) / productionPerTurn)
      : 999;

    production.push({
      turn,
      city,
      cityDisplayName: formatCityName(city),
      currentItem,
      itemDisplayName: formatEnumName(currentItem),
      productionPerTurn,
      currentProgress,
      productionNeeded,
      turnsRemaining: Math.max(0, turnsRemaining),
      overflow,
    });
  }

  return production;
}

// Parse AI_CityBuild.csv for city founding stats (food/production advantage)
export function parseCityFoundingStats(): CityFoundingStats[] {
  const filePath = join(LOGS_PATH, LOG_FILES.CITY_BUILD);
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return [];

  const stats: CityFoundingStats[] = [];
  const seenCities = new Map<string, CityFoundingStats>(); // Track first occurrence per city per player

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 5) continue;

    const turn = parseInt(values[0], 10);
    const playerId = parseInt(values[1], 10);
    const city = values[2];
    const foodAdvantage = parseFloat(values[3]);
    const productionAdvantage = parseFloat(values[4]);

    // Skip entries without food/production data (these are build decisions, not city founding)
    if (isNaN(foodAdvantage) || isNaN(productionAdvantage)) continue;

    // Only keep the first entry per city per player (founding data)
    const key = `${playerId}:${city}`;
    if (!seenCities.has(key)) {
      const foundingStat: CityFoundingStats = {
        turn,
        playerId,
        city,
        cityDisplayName: formatCityName(city),
        foodAdvantage,
        productionAdvantage,
      };
      seenCities.set(key, foundingStat);
      stats.push(foundingStat);
    }
  }

  return stats;
}

export function parseTechStatus(): TechProgress[] {
  const filePath = join(LOGS_PATH, LOG_FILES.TECH);
  if (!existsSync(filePath)) return [];

  const playerMap = buildPlayerIdMap();
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return [];

  const progress: TechProgress[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 7) continue;

    const turn = parseInt(values[0], 10);
    const playerId = parseInt(values[1], 10);
    const action = values[2];
    const tech = values[3];
    const status = values[5];
    const turnsRemaining = parseInt(values[6], 10);

    // Only include Tech entries (not Civic)
    if (action !== 'Tech') continue;

    progress.push({
      turn,
      civilization: formatCivName(getCivName(playerId, playerMap)),
      playerId,
      tech: formatEnumName(tech),
      status,
      turnsRemaining,
    });
  }

  return progress;
}

// ============ World Events Parsing ============

export function parseWorldCongress(): { votes: CongressVote[], results: CongressResult[] } {
  const filePath = join(LOGS_PATH, LOG_FILES.WORLD_CONGRESS);
  if (!existsSync(filePath)) return { votes: [], results: [] };

  const playerMap = buildPlayerIdMap();
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return { votes: [], results: [] };

  const votes: CongressVote[] = [];
  const results: CongressResult[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 3) continue;

    const turn = parseInt(values[0], 10);
    const action = values[1];
    const resolution = values[2];

    if (action === 'VOTES' && values.length >= 5) {
      const playerId = parseInt(values[3], 10);
      const voteCount = parseInt(values[4], 10);

      votes.push({
        turn,
        resolution: formatEnumName(resolution),
        playerId,
        player: formatCivName(getCivName(playerId, playerMap)),
        votes: voteCount,
        targetOption: 0,
      });
    } else if (action === 'OPTIONS' && values.length >= 6) {
      const playerId = parseInt(values[3], 10);
      const option1 = parseInt(values[4], 10);
      const option2 = parseInt(values[5], 10);

      // Update the corresponding vote with target option
      const vote = votes.find(v => v.turn === turn && v.playerId === playerId && v.resolution === formatEnumName(resolution));
      if (vote) {
        vote.targetOption = option2;
      }
    } else if (action === 'RESOLUTION DECIDED' && values.length >= 5) {
      const winningOption = parseInt(values[3], 10);
      const voteCount = parseInt(values[4], 10);

      results.push({
        turn,
        resolution: formatEnumName(resolution),
        winningOption,
        voteCount,
      });
    }
  }

  return { votes, results };
}

export function parseGreatPeople(): GreatPersonEvent[] {
  const filePath = join(LOGS_PATH, LOG_FILES.GREAT_PEOPLE);
  if (!existsSync(filePath)) return [];

  const playerMap = buildPlayerIdMap();
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return [];

  const events: GreatPersonEvent[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 7) continue;

    const turn = parseInt(values[0], 10);
    const event = values[1];
    const individual = values[2];
    const gpClass = values[3];
    const era = values[4];
    const cost = parseInt(values[5], 10);
    const recipientId = parseInt(values[6], 10);

    events.push({
      turn,
      event,
      individual,
      displayName: formatEnumName(individual),
      gpClass: formatEnumName(gpClass),
      era: formatEnumName(era),
      cost,
      recipientId,
      recipient: recipientId >= 0 ? formatCivName(getCivName(recipientId, playerMap)) : null,
    });
  }

  return events;
}

// Cultural great people classes for cultural victory tracking
const CULTURAL_GP_CLASSES = [
  'GREAT_PERSON_CLASS_ARTIST',
  'GREAT_PERSON_CLASS_WRITER',
  'GREAT_PERSON_CLASS_MUSICIAN',
];

export function parseCulturalGreatPeople(): GreatPersonEvent[] {
  const allGreatPeople = parseGreatPeople();
  return allGreatPeople.filter(gp =>
    CULTURAL_GP_CLASSES.some(c => gp.gpClass.toUpperCase().replace(/ /g, '_').includes(c.replace('GREAT_PERSON_CLASS_', '')))
  );
}

// ============ Formatting Functions ============

export function formatDiplomacyStatus(relations: DiplomaticRelation[], playerCiv?: string): string {
  if (relations.length === 0) {
    return 'No diplomatic data available.';
  }

  const lines: string[] = [];
  const latestTurn = Math.max(...relations.map(r => r.fromPlayerId));

  lines.push('# Diplomatic Status');
  lines.push('');

  // Group by fromCiv
  const byFromCiv = new Map<string, DiplomaticRelation[]>();
  for (const rel of relations) {
    if (!byFromCiv.has(rel.fromCiv)) {
      byFromCiv.set(rel.fromCiv, []);
    }
    byFromCiv.get(rel.fromCiv)!.push(rel);
  }

  // If playerCiv specified, show their relations first
  const civOrder = playerCiv
    ? [playerCiv, ...Array.from(byFromCiv.keys()).filter(c => c !== playerCiv)]
    : Array.from(byFromCiv.keys());

  for (const fromCiv of civOrder) {
    const civRelations = byFromCiv.get(fromCiv);
    if (!civRelations) continue;

    const isPlayer = fromCiv === playerCiv;
    lines.push(`## ${fromCiv}${isPlayer ? ' (You)' : ''}`);
    lines.push('');
    lines.push('| Civilization | Status | Score | Threat |');
    lines.push('|--------------|--------|-------|--------|');

    // Sort by score descending
    const sorted = [...civRelations].sort((a, b) => b.score - a.score);

    for (const rel of sorted) {
      const threatLevel = rel.threat > 50 ? 'High' : rel.threat > 25 ? 'Medium' : 'Low';
      const stateDisplay = rel.state.replace('_', ' ').toLowerCase();
      lines.push(`| ${rel.toCiv} | ${stateDisplay} | ${rel.score >= 0 ? '+' : ''}${rel.score} | ${threatLevel} |`);
    }
    lines.push('');

    // Only show first civ's relations in detail if not filtering
    if (!playerCiv) break;
  }

  // Show active wars
  const wars = relations.filter(r => r.state === 'WAR');
  if (wars.length > 0) {
    lines.push('## Active Wars');
    const warPairs = new Set<string>();
    for (const war of wars) {
      const pair = [war.fromCiv, war.toCiv].sort().join(' vs ');
      warPairs.add(pair);
    }
    for (const pair of warPairs) {
      lines.push(`- ${pair}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function formatDiplomacyModifiers(modifiers: DiplomaticModifier[], playerCiv?: string): string {
  if (modifiers.length === 0) {
    return 'No diplomatic modifiers available.';
  }

  const lines: string[] = [];
  lines.push('# Diplomatic Modifiers');
  lines.push('');

  // Get latest turn's modifiers
  const latestTurn = Math.max(...modifiers.map(m => m.turn));
  const latestModifiers = modifiers.filter(m => m.turn === latestTurn);

  // Group by player
  const byPlayer = new Map<string, DiplomaticModifier[]>();
  for (const mod of latestModifiers) {
    const key = playerCiv ? mod.player : mod.player;
    if (playerCiv && mod.player !== playerCiv) continue;

    if (!byPlayer.has(mod.player)) {
      byPlayer.set(mod.player, []);
    }
    byPlayer.get(mod.player)!.push(mod);
  }

  for (const [player, mods] of byPlayer) {
    lines.push(`## ${player}`);
    lines.push('');

    // Group by opponent
    const byOpponent = new Map<string, DiplomaticModifier[]>();
    for (const mod of mods) {
      if (!byOpponent.has(mod.opponent)) {
        byOpponent.set(mod.opponent, []);
      }
      byOpponent.get(mod.opponent)!.push(mod);
    }

    for (const [opponent, oppMods] of byOpponent) {
      const modStrings = oppMods
        .filter(m => m.value !== 0)
        .map(m => `${m.modifier} (${m.value >= 0 ? '+' : ''}${m.value})`)
        .slice(0, 5);  // Limit to 5 modifiers

      if (modStrings.length > 0) {
        lines.push(`**${opponent}**: ${modStrings.join(', ')}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function formatMilitaryIntelligence(intel: MilitaryIntelligence[]): string {
  if (intel.length === 0) {
    return 'No military intelligence available.';
  }

  const lines: string[] = [];

  // Get latest turn's data
  const latestTurn = Math.max(...intel.map(i => i.turn));
  const latestIntel = intel.filter(i => i.turn === latestTurn);

  lines.push(`# Military Intelligence (Turn ${latestTurn})`);
  lines.push('');
  lines.push('## Threat Assessment');
  lines.push('');
  lines.push('| Civilization | Strength | Combat Desire | Threat Level |');
  lines.push('|--------------|----------|---------------|--------------|');

  // Sort by regional strength
  const sorted = [...latestIntel].sort((a, b) => b.regionalStrength - a.regionalStrength);

  for (const civ of sorted) {
    const threatLevel = civ.combatDesire > 10 ? 'HIGH'
      : civ.combatDesire > 5 ? 'MEDIUM'
      : 'LOW';
    lines.push(`| ${civ.civilization} | ${civ.regionalStrength} | ${civ.combatDesire.toFixed(1)} | ${threatLevel} |`);
  }

  lines.push('');
  lines.push('## AI Military Priorities');
  lines.push('');

  for (const civ of sorted) {
    if (civ.favoriteTech && civ.favoriteTech !== 'No Tech') {
      lines.push(`- **${civ.civilization}**: Targeting ${civ.favoriteTech}`);
    }
  }

  // Show civs under threat (enemy strength > 0)
  const underThreat = latestIntel.filter(i => i.enemyStrength > 0);
  if (underThreat.length > 0) {
    lines.push('');
    lines.push('## Civs Under Military Pressure');
    lines.push('');
    for (const civ of underThreat) {
      const ratio = civ.regionalStrength / civ.enemyStrength;
      const status = ratio < 0.5 ? 'CRITICAL' : ratio < 1 ? 'Threatened' : 'Defending';
      lines.push(`- **${civ.civilization}**: ${civ.regionalStrength} vs ${civ.enemyStrength} enemy strength (${status})`);
    }
  }

  return lines.join('\n');
}

export function formatCombatLog(records: CombatRecord[], recentTurns: number = 5): string {
  if (records.length === 0) {
    return 'No combat records available.';
  }

  const lines: string[] = [];

  const latestTurn = Math.max(...records.map(r => r.turn));
  const minTurn = latestTurn - recentTurns;
  const recentRecords = records.filter(r => r.turn >= minTurn);

  lines.push(`# Combat Log (Last ${recentTurns} Turns)`);
  lines.push('');

  if (recentRecords.length === 0) {
    lines.push('No combat in recent turns.');
    return lines.join('\n');
  }

  // Group by turn
  const byTurn = new Map<number, CombatRecord[]>();
  for (const rec of recentRecords) {
    if (!byTurn.has(rec.turn)) {
      byTurn.set(rec.turn, []);
    }
    byTurn.get(rec.turn)!.push(rec);
  }

  const sortedTurns = Array.from(byTurn.keys()).sort((a, b) => b - a);

  for (const turn of sortedTurns) {
    lines.push(`## Turn ${turn}`);
    lines.push('');

    const turnRecords = byTurn.get(turn)!;
    for (const rec of turnRecords) {
      const outcome = rec.defenderDamage > rec.attackerDamage ? 'successful' : 'repelled';
      lines.push(`- **${rec.attackerCiv}** ${rec.attackerUnit} vs **${rec.defenderCiv}** ${rec.defenderUnit}: ${rec.defenderDamage} damage dealt, ${rec.attackerDamage} taken (${outcome})`);
    }
    lines.push('');
  }

  // Summary of active conflicts
  const conflicts = new Set<string>();
  for (const rec of recentRecords) {
    conflicts.add([rec.attackerCiv, rec.defenderCiv].sort().join(' vs '));
  }

  lines.push('## Active Conflicts');
  for (const conflict of conflicts) {
    lines.push(`- ${conflict}`);
  }

  return lines.join('\n');
}

export function formatCityProduction(production: CityProduction[], filterCiv?: string): string {
  if (production.length === 0) {
    return 'No production data available.';
  }

  const lines: string[] = [];

  // Get latest turn's data
  const latestTurn = Math.max(...production.map(p => p.turn));
  let latestProduction = production.filter(p => p.turn === latestTurn);

  lines.push(`# City Production (Turn ${latestTurn})`);
  lines.push('');

  // Key items to highlight
  const keyItems = [
    'Giant Death Robot', 'Manhattan Project', 'Moon Landing',
    'Launch Earth Satellite', 'Launch Moon Landing', 'Exoplanet Expedition',
    'Nuclear Device', 'Thermonuclear Device', 'Jet Fighter', 'Jet Bomber'
  ];

  // Find strategic production
  const strategicProduction = latestProduction.filter(p =>
    keyItems.some(item => p.itemDisplayName.includes(item.replace(' ', '')))
  );

  if (strategicProduction.length > 0) {
    lines.push('## Strategic Production (Watch These!)');
    lines.push('');
    for (const prod of strategicProduction) {
      const progress = Math.round((prod.currentProgress / prod.productionNeeded) * 100);
      lines.push(`- **${prod.cityDisplayName}**: ${prod.itemDisplayName} (${progress}%) - ${prod.turnsRemaining} turns`);
    }
    lines.push('');
  }

  // Group by city name pattern to infer civilization
  // This is a heuristic - cities from same civ tend to have similar naming patterns
  lines.push('## All Production');
  lines.push('');
  lines.push('| City | Building | Progress | Turns |');
  lines.push('|------|----------|----------|-------|');

  const sorted = [...latestProduction].sort((a, b) => a.turnsRemaining - b.turnsRemaining);

  for (const prod of sorted.slice(0, 30)) {  // Limit to 30 entries
    const progress = Math.round((prod.currentProgress / prod.productionNeeded) * 100);
    lines.push(`| ${prod.cityDisplayName} | ${prod.itemDisplayName} | ${progress}% | ${prod.turnsRemaining} |`);
  }

  return lines.join('\n');
}

export function formatCityStatus(
  production: CityProduction[],
  foundingStats: CityFoundingStats[],
  playerId: number = 0
): string {
  const lines: string[] = [];

  // Filter founding stats for the player
  const playerFoundingStats = foundingStats.filter(s => s.playerId === playerId);

  // Get latest production data
  const latestTurn = production.length > 0 ? Math.max(...production.map(p => p.turn)) : 0;
  const latestProduction = production.filter(p => p.turn === latestTurn);

  // Create a map of city production by city name
  const productionByCity = new Map<string, CityProduction>();
  for (const prod of latestProduction) {
    productionByCity.set(prod.city, prod);
  }

  // Get all player cities from founding stats
  const playerCities = playerFoundingStats.map(s => s.city);

  // Also add any cities from production that might not be in founding stats
  for (const prod of latestProduction) {
    if (!playerCities.includes(prod.city)) {
      // Try to determine if this is the player's city based on Australian city names
      // This is a heuristic - in practice all player cities should appear in founding stats
      const cityName = prod.city.toUpperCase();
      if (cityName.includes('CANBERRA') || cityName.includes('SYDNEY') ||
          cityName.includes('MELBOURNE') || cityName.includes('PERTH') ||
          cityName.includes('ADELAIDE') || cityName.includes('BRISBANE') ||
          cityName.includes('GEELONG') || cityName.includes('HOBART') ||
          cityName.includes('DARWIN') || cityName.includes('TOOWOOMBA') ||
          cityName.includes('BALLAARAT') || cityName.includes('NEWCASTLE')) {
        playerCities.push(prod.city);
      }
    }
  }

  if (playerFoundingStats.length === 0 && playerCities.length === 0) {
    return 'No city data available. Enable game logging with GameHistoryLogLevel=1 in UserOptions.txt.';
  }

  lines.push(`# City Status (Turn ${latestTurn})`);
  lines.push('');
  lines.push('*Note: Food advantage is from city founding. Negative values indicate challenging food locations.*');
  lines.push('');

  // Identify cities with food challenges
  const foodChallenged = playerFoundingStats.filter(s => s.foodAdvantage < 0)
    .sort((a, b) => a.foodAdvantage - b.foodAdvantage);
  const foodGood = playerFoundingStats.filter(s => s.foodAdvantage >= 0)
    .sort((a, b) => b.foodAdvantage - a.foodAdvantage);

  if (foodChallenged.length > 0) {
    lines.push('## Cities with Food Challenges');
    lines.push('');
    lines.push('These cities may struggle to grow without improvements like Granaries, Farms, or trade routes:');
    lines.push('');
    lines.push('| City | Founded | Food Adv. | Building | Turns |');
    lines.push('|------|---------|-----------|----------|-------|');

    for (const stat of foodChallenged) {
      const prod = productionByCity.get(stat.city);
      const building = prod ? prod.itemDisplayName : '-';
      const turns = prod ? prod.turnsRemaining.toString() : '-';
      const foodStr = stat.foodAdvantage.toFixed(2);
      lines.push(`| ${stat.cityDisplayName} | T${stat.turn} | ${foodStr} | ${building} | ${turns} |`);
    }
    lines.push('');
  }

  if (foodGood.length > 0) {
    lines.push('## Cities with Good Food');
    lines.push('');
    lines.push('| City | Founded | Food Adv. | Building | Turns |');
    lines.push('|------|---------|-----------|----------|-------|');

    for (const stat of foodGood) {
      const prod = productionByCity.get(stat.city);
      const building = prod ? prod.itemDisplayName : '-';
      const turns = prod ? prod.turnsRemaining.toString() : '-';
      const foodStr = `+${stat.foodAdvantage.toFixed(2)}`;
      lines.push(`| ${stat.cityDisplayName} | T${stat.turn} | ${foodStr} | ${building} | ${turns} |`);
    }
    lines.push('');
  }

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total cities**: ${playerFoundingStats.length}`);
  lines.push(`- **Food-challenged cities**: ${foodChallenged.length}`);
  if (foodChallenged.length > 0) {
    const worstCity = foodChallenged[0];
    lines.push(`- **Worst food city**: ${worstCity.cityDisplayName} (${worstCity.foodAdvantage.toFixed(2)})`);
  }
  if (foodGood.length > 0) {
    const bestCity = foodGood[0];
    lines.push(`- **Best food city**: ${bestCity.cityDisplayName} (+${bestCity.foodAdvantage.toFixed(2)})`);
  }

  return lines.join('\n');
}

export function formatTechStatus(progress: TechProgress[]): string {
  if (progress.length === 0) {
    return 'No tech data available.';
  }

  const lines: string[] = [];

  // Get latest turn's data
  const latestTurn = Math.max(...progress.map(p => p.turn));
  const latestProgress = progress.filter(p => p.turn === latestTurn);

  lines.push(`# Technology Status (Turn ${latestTurn})`);
  lines.push('');

  // Count techs per civ
  const techCounts = new Map<string, number>();
  for (const tech of latestProgress) {
    if (tech.status === 'OWNED') {
      techCounts.set(tech.civilization, (techCounts.get(tech.civilization) || 0) + 1);
    }
  }

  lines.push('## Tech Progress by Civilization');
  lines.push('');
  lines.push('| Civilization | Techs Researched |');
  lines.push('|--------------|------------------|');

  const sorted = Array.from(techCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [civ, count] of sorted) {
    lines.push(`| ${civ} | ${count} |`);
  }

  return lines.join('\n');
}

export function formatWorldCongress(votes: CongressVote[], results: CongressResult[]): string {
  if (votes.length === 0 && results.length === 0) {
    return 'No World Congress data available.';
  }

  const lines: string[] = [];
  lines.push('# World Congress');
  lines.push('');

  if (results.length > 0) {
    lines.push('## Recent Resolutions');
    lines.push('');

    for (const result of results) {
      lines.push(`- **${result.resolution}**: Option ${result.winningOption} passed (${result.voteCount} votes)`);
    }
    lines.push('');
  }

  if (votes.length > 0) {
    lines.push('## Voting Record');
    lines.push('');

    // Group by resolution
    const byResolution = new Map<string, CongressVote[]>();
    for (const vote of votes) {
      if (!byResolution.has(vote.resolution)) {
        byResolution.set(vote.resolution, []);
      }
      byResolution.get(vote.resolution)!.push(vote);
    }

    for (const [resolution, resVotes] of byResolution) {
      lines.push(`### ${resolution}`);
      lines.push('');
      for (const vote of resVotes) {
        lines.push(`- ${vote.player}: ${vote.votes} votes for option ${vote.targetOption}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function formatGreatPeople(events: GreatPersonEvent[]): string {
  if (events.length === 0) {
    return 'No Great People data available.';
  }

  const lines: string[] = [];
  lines.push('# Great People');
  lines.push('');

  const claimed = events.filter(e => e.event === 'Granted to Player');
  const available = events.filter(e => e.event === 'Added to Present Timeline');

  if (claimed.length > 0) {
    lines.push('## Recently Claimed');
    lines.push('');
    for (const gp of claimed) {
      lines.push(`- **${gp.displayName}** (${gp.gpClass}) - Claimed by ${gp.recipient}`);
    }
    lines.push('');
  }

  if (available.length > 0) {
    lines.push('## Available for Recruitment');
    lines.push('');
    for (const gp of available) {
      lines.push(`- **${gp.displayName}** (${gp.gpClass}, ${gp.era}) - Cost: ${gp.cost}`);
    }
  }

  return lines.join('\n');
}

export function formatCulturalGreatPeople(events: GreatPersonEvent[]): string {
  if (events.length === 0) {
    return 'No cultural Great People data available. Artists, Writers, and Musicians have not been recruited yet.';
  }

  const lines: string[] = [];
  lines.push('# Cultural Victory - Great People');
  lines.push('');
  lines.push('*Track who is collecting Great Artists, Writers, and Musicians for cultural victory.*');
  lines.push('');

  // Separate by type
  const artists = events.filter(e => e.gpClass.toLowerCase().includes('artist'));
  const writers = events.filter(e => e.gpClass.toLowerCase().includes('writer'));
  const musicians = events.filter(e => e.gpClass.toLowerCase().includes('musician'));

  // Count by civilization (only claimed ones)
  const claimedByCiv = new Map<string, { artists: number; writers: number; musicians: number; works: number }>();

  for (const gp of events) {
    if (gp.event === 'Granted to Player' && gp.recipient) {
      if (!claimedByCiv.has(gp.recipient)) {
        claimedByCiv.set(gp.recipient, { artists: 0, writers: 0, musicians: 0, works: 0 });
      }
      const counts = claimedByCiv.get(gp.recipient)!;
      if (gp.gpClass.toLowerCase().includes('artist')) counts.artists++;
      else if (gp.gpClass.toLowerCase().includes('writer')) counts.writers++;
      else if (gp.gpClass.toLowerCase().includes('musician')) counts.musicians++;
    } else if (gp.event === 'Great Person Activated' && gp.recipient) {
      // Activations = Great Works created
      const civ = events.find(e => e.event === 'Granted to Player' && e.individual === gp.individual)?.recipient;
      if (civ && claimedByCiv.has(civ)) {
        claimedByCiv.get(civ)!.works++;
      }
    }
  }

  // Summary table
  lines.push('## Cultural Victory Race');
  lines.push('');
  lines.push('| Civilization | Artists | Writers | Musicians | Total | Works Created |');
  lines.push('|--------------|---------|---------|-----------|-------|---------------|');

  const sorted = Array.from(claimedByCiv.entries())
    .sort((a, b) => {
      const totalA = a[1].artists + a[1].writers + a[1].musicians;
      const totalB = b[1].artists + b[1].writers + b[1].musicians;
      return totalB - totalA;
    });

  for (const [civ, counts] of sorted) {
    const total = counts.artists + counts.writers + counts.musicians;
    lines.push(`| ${civ} | ${counts.artists} | ${counts.writers} | ${counts.musicians} | ${total} | ${counts.works} |`);
  }
  lines.push('');

  // Detailed timeline of who got what
  const claimed = events.filter(e => e.event === 'Granted to Player');
  if (claimed.length > 0) {
    lines.push('## Recent Acquisitions');
    lines.push('');

    // Sort by turn descending, show last 10
    const recentClaimed = [...claimed].sort((a, b) => b.turn - a.turn).slice(0, 10);
    for (const gp of recentClaimed) {
      const type = gp.gpClass.toLowerCase().includes('artist') ? '🎨' :
                   gp.gpClass.toLowerCase().includes('writer') ? '📝' : '🎵';
      lines.push(`- T${gp.turn}: ${type} **${gp.displayName}** → ${gp.recipient}`);
    }
    lines.push('');
  }

  // Show what's available
  const available = events.filter(e => e.event === 'Added to Present Timeline');
  // Get the latest available for each class (most recent addition)
  const latestAvailable = new Map<string, GreatPersonEvent>();
  for (const gp of available) {
    const classKey = gp.gpClass.toLowerCase();
    if (!latestAvailable.has(classKey) || gp.turn > latestAvailable.get(classKey)!.turn) {
      latestAvailable.set(classKey, gp);
    }
  }

  if (latestAvailable.size > 0) {
    lines.push('## Currently Available');
    lines.push('');
    for (const [, gp] of latestAvailable) {
      const type = gp.gpClass.toLowerCase().includes('artist') ? '🎨' :
                   gp.gpClass.toLowerCase().includes('writer') ? '📝' : '🎵';
      lines.push(`- ${type} **${gp.displayName}** (${gp.gpClass}, ${gp.era}) - Cost: ${gp.cost}`);
    }
  }

  return lines.join('\n');
}

// ============ Strategic Overview ============

export function generateStrategicOverview(
  civStats: CivStatistics[],
  playerCiv?: string
): string {
  const lines: string[] = [];

  // Get all the data
  const relations = parseDiplomacy();
  const militaryIntel = parseMilitaryIntel();
  const combatRecords = parseCombatLog();
  const production = parseCityProduction();

  const latestTurn = civStats.length > 0 ? civStats[0].turn : 0;

  lines.push(`# Strategic Overview (Turn ${latestTurn})`);
  lines.push('');

  // Find player civ from relations or use first major civ
  const humanCiv = playerCiv || (civStats.find(s => !s.isCityState)?.civilization || 'Unknown');

  // ============ Immediate Threats ============
  lines.push('## Immediate Threats');
  lines.push('');

  const threats: StrategicThreat[] = [];

  // Check military threats
  const latestMilitary = militaryIntel.filter(i =>
    i.turn === Math.max(...militaryIntel.map(m => m.turn))
  );

  for (const mil of latestMilitary) {
    if (mil.civilization === humanCiv) continue;

    if (mil.combatDesire > 10) {
      threats.push({
        civilization: mil.civilization,
        threatLevel: 'HIGH',
        reason: 'Extremely aggressive',
        details: `Combat Desire: ${mil.combatDesire.toFixed(1)}, Strength: ${mil.regionalStrength}`,
      });
    } else if (mil.combatDesire > 5 && mil.regionalStrength > 500) {
      threats.push({
        civilization: mil.civilization,
        threatLevel: 'MEDIUM',
        reason: 'Strong military with aggressive posture',
        details: `Combat Desire: ${mil.combatDesire.toFixed(1)}, Strength: ${mil.regionalStrength}`,
      });
    }
  }

  // Check for dangerous production (GDRs, nukes)
  const dangerousItems = ['Giant Death Robot', 'Nuclear Device', 'Thermonuclear Device'];
  const latestProd = production.filter(p =>
    p.turn === Math.max(...production.map(pr => pr.turn))
  );

  const civDangerousProd = new Map<string, string[]>();
  for (const prod of latestProd) {
    for (const danger of dangerousItems) {
      if (prod.itemDisplayName.toLowerCase().includes(danger.toLowerCase().replace(' ', ''))) {
        // Infer civ from city name (heuristic)
        const civGuess = prod.cityDisplayName;
        if (!civDangerousProd.has(civGuess)) {
          civDangerousProd.set(civGuess, []);
        }
        civDangerousProd.get(civGuess)!.push(prod.itemDisplayName);
      }
    }
  }

  // Check diplomatic threats (deduplicated)
  const hostileRelations = relations.filter(r =>
    r.fromCiv === humanCiv &&
    (r.state === 'DENOUNCED' || r.state === 'UNFRIENDLY' || r.state === 'WAR')
  );

  const seenHostileCivs = new Set<string>();
  for (const rel of hostileRelations) {
    if (seenHostileCivs.has(rel.toCiv)) continue;
    seenHostileCivs.add(rel.toCiv);

    const existingThreat = threats.find(t => t.civilization === rel.toCiv);
    if (!existingThreat && rel.state !== 'WAR') {
      threats.push({
        civilization: rel.toCiv,
        threatLevel: rel.state === 'DENOUNCED' ? 'MEDIUM' : 'LOW',
        reason: `Hostile diplomatic stance`,
        details: `Status: ${rel.state}, Score: ${rel.score}`,
      });
    }
  }

  if (threats.length === 0) {
    lines.push('No immediate threats detected.');
  } else {
    for (const threat of threats.sort((a, b) =>
      a.threatLevel === 'HIGH' ? -1 : b.threatLevel === 'HIGH' ? 1 : 0
    )) {
      lines.push(`${threat.threatLevel === 'HIGH' ? '1.' : '-'} **${threat.civilization}** - ${threat.reason}`);
      lines.push(`   ${threat.details}`);
    }
  }
  lines.push('');

  // ============ Diplomatic Opportunities ============
  lines.push('## Diplomatic Opportunities');
  lines.push('');

  const friendlyRelations = relations.filter(r =>
    r.fromCiv === humanCiv &&
    (r.state === 'ALLIED' || r.state === 'FRIENDLY' || r.state === 'DECLARED_FRIEND')
  );

  // Deduplicate and keep best score per civ
  const bestFriendlyByCiv = new Map<string, DiplomaticRelation>();
  for (const rel of friendlyRelations) {
    const existing = bestFriendlyByCiv.get(rel.toCiv);
    if (!existing || rel.score > existing.score) {
      bestFriendlyByCiv.set(rel.toCiv, rel);
    }
  }

  const uniqueFriendly = Array.from(bestFriendlyByCiv.values());

  if (uniqueFriendly.length === 0) {
    lines.push('No strong allies or friends.');
  } else {
    for (const rel of uniqueFriendly.sort((a, b) => b.score - a.score)) {
      const suggestion = rel.state === 'ALLIED'
        ? 'Consider joint war or research agreement'
        : 'Could be upgraded to alliance';
      lines.push(`- **${rel.toCiv}**: ${rel.state} (+${rel.score}) - ${suggestion}`);
    }
  }
  lines.push('');

  // ============ Active Conflicts ============
  const recentCombat = combatRecords.filter(r =>
    r.turn >= Math.max(...combatRecords.map(c => c.turn)) - 3
  );

  if (recentCombat.length > 0) {
    lines.push('## Active Conflicts');
    lines.push('');

    const conflicts = new Map<string, { attacker: string, defender: string, battles: number }>();
    for (const combat of recentCombat) {
      const key = [combat.attackerCiv, combat.defenderCiv].sort().join(' vs ');
      if (!conflicts.has(key)) {
        conflicts.set(key, { attacker: combat.attackerCiv, defender: combat.defenderCiv, battles: 0 });
      }
      conflicts.get(key)!.battles++;
    }

    for (const [key, info] of conflicts) {
      lines.push(`- ${key}: ${info.battles} recent battles`);
    }
    lines.push('');
  }

  // ============ Victory Race ============
  lines.push('## Victory Race');
  lines.push('');
  lines.push('| Victory Type | Leader | Your Position |');
  lines.push('|--------------|--------|---------------|');

  const majorCivs = civStats.filter(s => !s.isCityState);

  // Score
  const byScore = [...majorCivs].sort((a, b) => b.score - a.score);
  const playerScorePos = byScore.findIndex(c => c.civilization === humanCiv) + 1;
  lines.push(`| Score | ${byScore[0]?.leader} (${byScore[0]?.score}) | ${playerScorePos > 0 ? `#${playerScorePos}` : 'N/A'} |`);

  // Science
  const byTechs = [...majorCivs].sort((a, b) => b.techsResearched - a.techsResearched);
  const playerTechPos = byTechs.findIndex(c => c.civilization === humanCiv) + 1;
  lines.push(`| Science | ${byTechs[0]?.leader} (${byTechs[0]?.techsResearched} techs) | ${playerTechPos > 0 ? `#${playerTechPos}` : 'N/A'} |`);

  // Culture
  const byCulture = [...majorCivs].sort((a, b) => b.culturePerTurn - a.culturePerTurn);
  const playerCulturePos = byCulture.findIndex(c => c.civilization === humanCiv) + 1;
  lines.push(`| Culture | ${byCulture[0]?.leader} (${byCulture[0]?.culturePerTurn}/turn) | ${playerCulturePos > 0 ? `#${playerCulturePos}` : 'N/A'} |`);

  // Military
  const byMilitary = [...majorCivs].sort((a, b) =>
    (b.landUnits + b.navalUnits) - (a.landUnits + a.navalUnits)
  );
  const playerMilPos = byMilitary.findIndex(c => c.civilization === humanCiv) + 1;
  lines.push(`| Domination | ${byMilitary[0]?.leader} (${byMilitary[0]?.landUnits + byMilitary[0]?.navalUnits} units) | ${playerMilPos > 0 ? `#${playerMilPos}` : 'N/A'} |`);

  lines.push('');

  // ============ Key Production to Watch ============
  const strategicItems = [
    'Giant Death Robot', 'Manhattan Project', 'Moon Landing',
    'Exoplanet Expedition', 'Launch Earth Satellite'
  ];

  const strategicProd = latestProd.filter(p =>
    strategicItems.some(item =>
      p.itemDisplayName.toLowerCase().includes(item.toLowerCase().replace(/ /g, ''))
    )
  );

  if (strategicProd.length > 0) {
    lines.push('## Key Production to Watch');
    lines.push('');
    for (const prod of strategicProd) {
      const progress = Math.round((prod.currentProgress / prod.productionNeeded) * 100);
      lines.push(`- **${prod.cityDisplayName}**: ${prod.itemDisplayName} (${progress}%) - ${prod.turnsRemaining} turns`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
