import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { CivStatistics, VictoryProgress, GameHistory, TurnData, CivTrend } from './types.js';
import { getLogsDirectory } from './paths.js';

// Re-export for backwards compatibility
export { getLogsDirectory } from './paths.js';

const LOGS_PATH = getLogsDirectory();

const PLAYER_STATS_FILE = 'Player_Stats.csv';
const PLAYER_SCORES_FILE = 'Game_PlayerScores.csv';

export function findHistoryFile(): string | null {
  const statsPath = join(LOGS_PATH, PLAYER_STATS_FILE);
  if (existsSync(statsPath)) {
    return statsPath;
  }
  return null;
}

interface RawPlayerStats {
  turn: number;
  civilization: string;
  numCities: number;
  population: number;
  techs: number;
  civics: number;
  landUnits: number;
  corps: number;
  armies: number;
  navalUnits: number;
  tilesOwned: number;
  tilesImproved: number;
  goldBalance: number;
  faithBalance: number;
  scienceYield: number;
  cultureYield: number;
  goldYield: number;
  faithYield: number;
  productionYield: number;
  foodYield: number;
}

interface RawPlayerScore {
  turn: number;
  playerId: number;
  score: number;
  civics: number;
  empire: number;
  greatPeople: number;
  religion: number;
  tech: number;
  wonder: number;
}

function parsePlayerStatsCSV(): RawPlayerStats[] {
  const statsPath = join(LOGS_PATH, PLAYER_STATS_FILE);
  if (!existsSync(statsPath)) {
    return [];
  }

  const content = readFileSync(statsPath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return [];

  const stats: RawPlayerStats[] = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 20) continue;

    stats.push({
      turn: parseInt(values[0], 10),
      civilization: values[1].replace('CIVILIZATION_', ''),
      numCities: parseInt(values[2], 10),
      population: parseInt(values[3], 10),
      techs: parseInt(values[4], 10),
      civics: parseInt(values[5], 10),
      landUnits: parseInt(values[6], 10),
      corps: parseInt(values[7], 10),
      armies: parseInt(values[8], 10),
      navalUnits: parseInt(values[9], 10),
      tilesOwned: parseInt(values[10], 10),
      tilesImproved: parseInt(values[11], 10),
      goldBalance: parseInt(values[12], 10),
      faithBalance: parseInt(values[13], 10),
      scienceYield: parseInt(values[14], 10),
      cultureYield: parseInt(values[15], 10),
      goldYield: parseInt(values[16], 10),
      faithYield: parseInt(values[17], 10),
      productionYield: parseInt(values[18], 10),
      foodYield: parseInt(values[19], 10),
    });
  }

  return stats;
}

function parsePlayerScoresCSV(): RawPlayerScore[] {
  const scoresPath = join(LOGS_PATH, PLAYER_SCORES_FILE);
  if (!existsSync(scoresPath)) {
    return [];
  }

  const content = readFileSync(scoresPath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) return [];

  const scores: RawPlayerScore[] = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 9) continue;

    scores.push({
      turn: parseInt(values[0], 10),
      playerId: parseInt(values[1], 10),
      score: parseInt(values[2], 10),
      civics: parseInt(values[3], 10),
      empire: parseInt(values[4], 10),
      greatPeople: parseInt(values[5], 10),
      religion: parseInt(values[6], 10),
      tech: parseInt(values[7], 10),
      wonder: parseInt(values[8], 10),
    });
  }

  return scores;
}

// Map civilization names to proper display names
const CIV_DISPLAY_NAMES: Record<string, { civ: string; leader: string }> = {
  // Major Civilizations
  'AMERICA': { civ: 'America', leader: 'Theodore Roosevelt' },
  'ARABIA': { civ: 'Arabia', leader: 'Saladin' },
  'AUSTRALIA': { civ: 'Australia', leader: 'John Curtin' },
  'AZTEC': { civ: 'Aztec', leader: 'Montezuma' },
  'BABYLON_STK': { civ: 'Babylon', leader: 'Hammurabi' },
  'BRAZIL': { civ: 'Brazil', leader: 'Pedro II' },
  'BYZANTIUM': { civ: 'Byzantium', leader: 'Basil II' },
  'CANADA': { civ: 'Canada', leader: 'Wilfrid Laurier' },
  'CHINA': { civ: 'China', leader: 'Qin Shi Huang' },
  'CREE': { civ: 'Cree', leader: 'Poundmaker' },
  'EGYPT': { civ: 'Egypt', leader: 'Cleopatra' },
  'ENGLAND': { civ: 'England', leader: 'Victoria' },
  'ETHIOPIA': { civ: 'Ethiopia', leader: 'Menelik II' },
  'FRANCE': { civ: 'France', leader: 'Catherine de Medici' },
  'GAUL': { civ: 'Gaul', leader: 'Ambiorix' },
  'GEORGIA': { civ: 'Georgia', leader: 'Tamar' },
  'GERMANY': { civ: 'Germany', leader: 'Frederick Barbarossa' },
  'GRAN_COLOMBIA': { civ: 'Gran Colombia', leader: 'Simón Bolívar' },
  'GREECE': { civ: 'Greece', leader: 'Pericles' },
  'HUNGARY': { civ: 'Hungary', leader: 'Matthias Corvinus' },
  'INCA': { civ: 'Inca', leader: 'Pachacuti' },
  'INDIA': { civ: 'India', leader: 'Gandhi' },
  'INDONESIA': { civ: 'Indonesia', leader: 'Gitarja' },
  'JAPAN': { civ: 'Japan', leader: 'Hojo Tokimune' },
  'KHMER': { civ: 'Khmer', leader: 'Jayavarman VII' },
  'KONGO': { civ: 'Kongo', leader: 'Mvemba a Nzinga' },
  'KOREA': { civ: 'Korea', leader: 'Seondeok' },
  'MACEDON': { civ: 'Macedon', leader: 'Alexander' },
  'MALI': { civ: 'Mali', leader: 'Mansa Musa' },
  'MAORI': { civ: 'Maori', leader: 'Kupe' },
  'MAPUCHE': { civ: 'Mapuche', leader: 'Lautaro' },
  'MAYA': { civ: 'Maya', leader: 'Lady Six Sky' },
  'MONGOLIA': { civ: 'Mongolia', leader: 'Genghis Khan' },
  'NETHERLANDS': { civ: 'Netherlands', leader: 'Wilhelmina' },
  'NORWAY': { civ: 'Norway', leader: 'Harald Hardrada' },
  'NUBIA': { civ: 'Nubia', leader: 'Amanitore' },
  'OTTOMAN': { civ: 'Ottoman Empire', leader: 'Suleiman' },
  'PERSIA': { civ: 'Persia', leader: 'Cyrus' },
  'PHOENICIA': { civ: 'Phoenicia', leader: 'Dido' },
  'POLAND': { civ: 'Poland', leader: 'Jadwiga' },
  'PORTUGAL': { civ: 'Portugal', leader: 'João III' },
  'ROME': { civ: 'Rome', leader: 'Trajan' },
  'RUSSIA': { civ: 'Russia', leader: 'Peter' },
  'SCOTLAND': { civ: 'Scotland', leader: 'Robert the Bruce' },
  'SCYTHIA': { civ: 'Scythia', leader: 'Tomyris' },
  'SPAIN': { civ: 'Spain', leader: 'Philip II' },
  'SUMERIA': { civ: 'Sumeria', leader: 'Gilgamesh' },
  'SWEDEN': { civ: 'Sweden', leader: 'Kristina' },
  'VIETNAM': { civ: 'Vietnam', leader: 'Bà Triệu' },
  'ZULU': { civ: 'Zulu', leader: 'Shaka' },
  'FREE_CITIES': { civ: 'Free Cities', leader: 'Free Cities' },
  // City-states
  'TARUGA': { civ: 'Taruga', leader: 'Taruga' },
  'AKKAD': { civ: 'Akkad', leader: 'Akkad' },
  'NGAZARGAMU': { civ: 'Ngazargamu', leader: 'Ngazargamu' },
  'BRUSSELS': { civ: 'Brussels', leader: 'Brussels' },
  'BABYLON': { civ: 'Babylon', leader: 'Babylon' },
  'LA_VENTA': { civ: 'La Venta', leader: 'La Venta' },
  'HUNZA': { civ: 'Hunza', leader: 'Hunza' },
  'HATTUSA': { civ: 'Hattusa', leader: 'Hattusa' },
  'KABUL': { civ: 'Kabul', leader: 'Kabul' },
  'SINGAPORE': { civ: 'Singapore', leader: 'Singapore' },
  'GRANADA': { civ: 'Granada', leader: 'Granada' },
  'CAHOKIA': { civ: 'Cahokia', leader: 'Cahokia' },
  'ZANZIBAR': { civ: 'Zanzibar', leader: 'Zanzibar' },
  'MITLA': { civ: 'Mitla', leader: 'Mitla' },
  'JOHANNESBURG': { civ: 'Johannesburg', leader: 'Johannesburg' },
  'MUSCAT': { civ: 'Muscat', leader: 'Muscat' },
  'GENEVA': { civ: 'Geneva', leader: 'Geneva' },
  'VALLETTA': { civ: 'Valletta', leader: 'Valletta' },
  'BUENOS_AIRES': { civ: 'Buenos Aires', leader: 'Buenos Aires' },
  'ANTANANARIVO': { civ: 'Antananarivo', leader: 'Antananarivo' },
  'KUMASI': { civ: 'Kumasi', leader: 'Kumasi' },
  'VILNIUS': { civ: 'Vilnius', leader: 'Vilnius' },
  'BOLOGNA': { civ: 'Bologna', leader: 'Bologna' },
  'FEZ': { civ: 'Fez', leader: 'Fez' },
  'JERUSALEM': { civ: 'Jerusalem', leader: 'Jerusalem' },
  'KANDY': { civ: 'Kandy', leader: 'Kandy' },
  'YEREVAN': { civ: 'Yerevan', leader: 'Yerevan' },
  'VATICAN_CITY': { civ: 'Vatican City', leader: 'Vatican City' },
  'AUCKLAND': { civ: 'Auckland', leader: 'Auckland' },
  'NAZCA': { civ: 'Nazca', leader: 'Nazca' },
  'SAMARKAND': { civ: 'Samarkand', leader: 'Samarkand' },
  'ANTIOCH': { civ: 'Antioch', leader: 'Antioch' },
  'BANDAR_BRUNEI': { civ: 'Bandar Brunei', leader: 'Bandar Brunei' },
  'HONG_KONG': { civ: 'Hong Kong', leader: 'Hong Kong' },
  'AMSTERDAM': { civ: 'Amsterdam', leader: 'Amsterdam' },
  'STOCKHOLM': { civ: 'Stockholm', leader: 'Stockholm' },
  'MOHENJO_DARO': { civ: 'Mohenjo-Daro', leader: 'Mohenjo-Daro' },
  'NAN_MADOL': { civ: 'Nan Madol', leader: 'Nan Madol' },
  'PRESLAV': { civ: 'Preslav', leader: 'Preslav' },
  'RAPA_NUI': { civ: 'Rapa Nui', leader: 'Rapa Nui' },
  'TORONTO': { civ: 'Toronto', leader: 'Toronto' },
  'ARMAGH': { civ: 'Armagh', leader: 'Armagh' },
  'CHINGUETTI': { civ: 'Chinguetti', leader: 'Chinguetti' },
  'LAHORE': { civ: 'Lahore', leader: 'Lahore' },
};

function getCivDisplayInfo(rawName: string): { civ: string; leader: string } {
  const info = CIV_DISPLAY_NAMES[rawName];
  if (info) return info;

  // Format unknown names
  const formatted = rawName.split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  return { civ: formatted, leader: formatted };
}

function isCityState(civName: string): boolean {
  const cityStates = [
    'TARUGA', 'AKKAD', 'NGAZARGAMU', 'BRUSSELS', 'BABYLON', 'LA_VENTA', 'HUNZA',
    'HATTUSA', 'KABUL', 'SINGAPORE', 'GRANADA', 'CAHOKIA', 'ZANZIBAR', 'MITLA',
    'JOHANNESBURG', 'MUSCAT', 'GENEVA', 'VALLETTA', 'BUENOS_AIRES', 'ANTANANARIVO',
    'KUMASI', 'VILNIUS', 'BOLOGNA', 'FEZ', 'JERUSALEM', 'KANDY', 'YEREVAN',
    'VATICAN_CITY', 'AUCKLAND', 'NAZCA', 'SAMARKAND', 'ANTIOCH', 'BANDAR_BRUNEI',
  ];
  return cityStates.includes(civName) || civName === 'FREE_CITIES';
}

export function parseGameHistory(): GameHistory | null {
  const rawStats = parsePlayerStatsCSV();
  if (rawStats.length === 0) {
    return null;
  }

  // Parse scores and group by turn
  const rawScores = parsePlayerScoresCSV();
  const scoresByTurn = new Map<number, Map<number, number>>();
  for (const score of rawScores) {
    if (!scoresByTurn.has(score.turn)) {
      scoresByTurn.set(score.turn, new Map());
    }
    scoresByTurn.get(score.turn)!.set(score.playerId, score.score);
  }

  const history: GameHistory = {
    turns: [],
    civilizations: [],
  };

  // Group stats by turn
  const turnMap = new Map<number, RawPlayerStats[]>();
  const civSet = new Set<string>();

  for (const stat of rawStats) {
    if (!turnMap.has(stat.turn)) {
      turnMap.set(stat.turn, []);
    }
    turnMap.get(stat.turn)!.push(stat);
    civSet.add(stat.civilization);
  }

  // Convert to TurnData
  for (const [turn, stats] of turnMap) {
    const turnScores = scoresByTurn.get(turn);

    const turnData: TurnData = {
      turn,
      civStats: stats.map((s, index) => {
        const displayInfo = getCivDisplayInfo(s.civilization);
        // Match scores by index - civs appear in same order in both files
        const score = turnScores?.get(index) ?? 0;
        return {
          civilization: displayInfo.civ,
          leader: displayInfo.leader,
          rawCivName: s.civilization,
          isCityState: isCityState(s.civilization),
          turn: s.turn,
          score,
          cities: s.numCities,
          population: s.population,
          sciencePerTurn: s.scienceYield,
          culturePerTurn: s.cultureYield,
          goldPerTurn: s.goldYield,
          faithPerTurn: s.faithYield,
          landUnits: s.landUnits + s.corps + s.armies,
          navalUnits: s.navalUnits,
          goldBalance: s.goldBalance,
          faithBalance: s.faithBalance,
          techsResearched: s.techs,
          civicsResearched: s.civics,
          tilesOwned: s.tilesOwned,
          tilesImproved: s.tilesImproved,
        };
      }),
    };
    history.turns.push(turnData);
  }

  // Sort turns
  history.turns.sort((a, b) => a.turn - b.turn);
  history.civilizations = [...civSet].map(c => getCivDisplayInfo(c).civ);

  return history;
}

export function getLatestTurnStats(): CivStatistics[] | null {
  const history = parseGameHistory();
  if (!history || history.turns.length === 0) {
    return null;
  }

  // Return stats from the most recent turn, excluding city-states
  const latestTurn = history.turns[history.turns.length - 1];
  return latestTurn.civStats;
}

export function getLatestTurnStatsFullCivsOnly(): CivStatistics[] | null {
  // Early exit if log file doesn't exist
  const statsPath = join(LOGS_PATH, PLAYER_STATS_FILE);
  if (!existsSync(statsPath)) {
    return null;
  }

  const history = parseGameHistory();
  if (!history || history.turns.length === 0) {
    return null;
  }

  // Find the most recent COMPLETE turn (one with multiple major civs)
  // Current turn may only have the player's data if it's mid-turn
  for (let i = history.turns.length - 1; i >= 0; i--) {
    const turnStats = history.turns[i].civStats;
    if (!turnStats || turnStats.length === 0) continue;

    // Filter to major civs only
    const majorCivs = turnStats.filter(s => !s.isCityState);

    // If we have multiple major civs, this is a complete turn
    if (majorCivs.length > 1) {
      return majorCivs;
    }
  }

  // Fallback to latest turn if no complete turns found
  const latestStats = history.turns[history.turns.length - 1]?.civStats;
  if (!latestStats) return null;

  return latestStats.filter(s => !s.isCityState);
}

export function getStatsForTurn(turnNumber: number): CivStatistics[] | null {
  const history = parseGameHistory();
  if (!history) {
    return null;
  }

  const turnData = history.turns.find(t => t.turn === turnNumber);
  return turnData?.civStats || null;
}

export function calculateVictoryProgress(stats: CivStatistics[]): VictoryProgress[] {
  if (!stats || stats.length === 0) {
    return [];
  }

  // Filter to just major civs (not city-states)
  const majorCivs = stats.filter(s => !s.isCityState);

  // Sort by various metrics to determine positions
  const byScience = [...majorCivs].sort((a, b) => b.techsResearched - a.techsResearched);
  const byCulture = [...majorCivs].sort((a, b) => b.culturePerTurn - a.culturePerTurn);
  const byMilitary = [...majorCivs].sort((a, b) => (b.landUnits + b.navalUnits) - (a.landUnits + a.navalUnits));
  const byScore = [...majorCivs].sort((a, b) => b.score - a.score);

  return majorCivs.map(stat => {
    const sciencePos = byScience.findIndex(s => s.civilization === stat.civilization) + 1;
    const culturePos = byCulture.findIndex(s => s.civilization === stat.civilization) + 1;
    const militaryPos = byMilitary.findIndex(s => s.civilization === stat.civilization) + 1;
    const scorePos = byScore.findIndex(s => s.civilization === stat.civilization) + 1;

    return {
      civilization: stat.civilization,
      leader: stat.leader,
      science: {
        position: sciencePos,
        techsResearched: stat.techsResearched,
        sciencePerTurn: stat.sciencePerTurn,
      },
      culture: {
        position: culturePos,
        domesticTourists: 0, // Not available from CSV
        visitingTourists: 0,
        culturePerTurn: stat.culturePerTurn,
      },
      domination: {
        position: militaryPos,
        militaryStrength: stat.landUnits + stat.navalUnits,
        capitalsControlled: 0,
      },
      diplomatic: {
        position: 0,
        diplomaticVictoryPoints: 0,
      },
      religion: {
        position: 0,
        citiesFollowingReligion: 0,
      },
      score: {
        position: scorePos,
        totalScore: stat.score,
      },
    };
  });
}

export function formatStatsComparison(stats: CivStatistics[]): string {
  if (!stats || stats.length === 0) {
    return 'No statistics available.';
  }

  // Filter to major civs only
  const majorCivs = stats.filter(s => !s.isCityState);

  const lines: string[] = [];
  lines.push('# Civilization Statistics Comparison');
  lines.push(`Turn: ${majorCivs[0]?.turn || 'N/A'}`);
  lines.push('');

  // Sort by score (descending)
  const sorted = [...majorCivs].sort((a, b) => b.score - a.score);

  // Header with Score column
  lines.push('| Rank | Civilization | Score | Cities | Science/t | Culture/t | Gold/t | Faith/t | Military |');
  lines.push('|------|--------------|-------|--------|-----------|-----------|--------|---------|----------|');

  sorted.forEach((stat, idx) => {
    const military = stat.landUnits + stat.navalUnits;
    lines.push(`| ${idx + 1} | ${stat.leader} (${stat.civilization}) | ${stat.score} | ${stat.cities} | ${stat.sciencePerTurn} | ${stat.culturePerTurn} | ${stat.goldPerTurn} | ${stat.faithPerTurn} | ${military} |`);
  });

  // Add resources section
  lines.push('');
  lines.push('## Resources & Progress');
  lines.push('| Civilization | Gold | Faith | Techs | Civics | Pop | Tiles |');
  lines.push('|--------------|------|-------|-------|--------|-----|-------|');

  for (const stat of sorted) {
    lines.push(`| ${stat.civilization} | ${stat.goldBalance} | ${stat.faithBalance} | ${stat.techsResearched} | ${stat.civicsResearched} | ${stat.population} | ${stat.tilesOwned} |`);
  }

  return lines.join('\n');
}

export function formatVictoryProgress(progress: VictoryProgress[]): string {
  if (!progress || progress.length === 0) {
    return 'No victory progress data available.';
  }

  const lines: string[] = [];
  lines.push('# Victory Progress');
  lines.push('');

  // Science Victory
  lines.push('## Science Victory (by Techs Researched)');
  const byScience = [...progress].sort((a, b) => a.science.position - b.science.position);
  for (const p of byScience) {
    const marker = p.science.position === 1 ? '🥇' : p.science.position === 2 ? '🥈' : p.science.position === 3 ? '🥉' : `${p.science.position}.`;
    lines.push(`${marker} **${p.leader}** (${p.civilization}) - ${p.science.techsResearched} techs, ${p.science.sciencePerTurn}/turn`);
  }
  lines.push('');

  // Culture Victory
  lines.push('## Culture Victory (by Culture/turn)');
  const byCulture = [...progress].sort((a, b) => a.culture.position - b.culture.position);
  for (const p of byCulture) {
    const marker = p.culture.position === 1 ? '🥇' : p.culture.position === 2 ? '🥈' : p.culture.position === 3 ? '🥉' : `${p.culture.position}.`;
    lines.push(`${marker} **${p.leader}** (${p.civilization}) - ${p.culture.culturePerTurn}/turn`);
  }
  lines.push('');

  // Domination
  lines.push('## Domination (by Military Strength)');
  const byMilitary = [...progress].sort((a, b) => a.domination.position - b.domination.position);
  for (const p of byMilitary) {
    const marker = p.domination.position === 1 ? '🥇' : p.domination.position === 2 ? '🥈' : p.domination.position === 3 ? '🥉' : `${p.domination.position}.`;
    lines.push(`${marker} **${p.leader}** (${p.civilization}) - ${p.domination.militaryStrength} units`);
  }

  return lines.join('\n');
}

// ============ Trend Analysis ============

export function analyzeTrends(turnsBack: number = 10): CivTrend[] | null {
  const history = parseGameHistory();
  if (!history || history.turns.length < 2) {
    return null;
  }

  // Get unique civilizations from the latest turn (major civs only)
  const latestTurn = history.turns[history.turns.length - 1];
  const majorCivs = latestTurn.civStats.filter(s => !s.isCityState);

  if (majorCivs.length === 0) {
    return null;
  }

  const trends: CivTrend[] = [];
  const endTurnNum = latestTurn.turn;
  const startTurnNum = Math.max(1, endTurnNum - turnsBack);

  // Find actual turns in the data within range
  const relevantTurns = history.turns.filter(
    t => t.turn >= startTurnNum && t.turn <= endTurnNum
  );

  if (relevantTurns.length < 2) {
    return null;
  }

  const actualStartTurn = relevantTurns[0];
  const actualEndTurn = relevantTurns[relevantTurns.length - 1];

  for (const civ of majorCivs) {
    const startStats = actualStartTurn.civStats.find(
      s => s.civilization === civ.civilization && !s.isCityState
    );
    const endStats = actualEndTurn.civStats.find(
      s => s.civilization === civ.civilization && !s.isCityState
    );

    if (!startStats || !endStats) continue;

    const calcChange = (start: number, end: number) => ({
      start,
      end,
      change: end - start,
      percentChange: start > 0 ? Math.round(((end - start) / start) * 100) : 0,
    });

    const startMilitary = startStats.landUnits + startStats.navalUnits;
    const endMilitary = endStats.landUnits + endStats.navalUnits;

    trends.push({
      civilization: civ.civilization,
      leader: civ.leader,
      turnsAnalyzed: actualEndTurn.turn - actualStartTurn.turn,
      startTurn: actualStartTurn.turn,
      endTurn: actualEndTurn.turn,
      score: calcChange(startStats.score, endStats.score),
      science: calcChange(startStats.sciencePerTurn, endStats.sciencePerTurn),
      culture: calcChange(startStats.culturePerTurn, endStats.culturePerTurn),
      gold: calcChange(startStats.goldPerTurn, endStats.goldPerTurn),
      military: calcChange(startMilitary, endMilitary),
      cities: {
        start: startStats.cities,
        end: endStats.cities,
        change: endStats.cities - startStats.cities,
      },
      territory: calcChange(startStats.tilesOwned, endStats.tilesOwned),
      techs: {
        start: startStats.techsResearched,
        end: endStats.techsResearched,
        change: endStats.techsResearched - startStats.techsResearched,
      },
    });
  }

  return trends;
}

export function formatTrendAnalysis(trends: CivTrend[]): string {
  if (!trends || trends.length === 0) {
    return 'No trend data available. Need at least 2 turns of history.';
  }

  const lines: string[] = [];
  const sample = trends[0];
  lines.push(`# Trend Analysis (Turns ${sample.startTurn} → ${sample.endTurn})`);
  lines.push('');

  // Score trends
  lines.push('## Score Trends');
  const byScoreGrowth = [...trends].sort((a, b) => b.score.change - a.score.change);
  lines.push('| Civilization | Score | Change | Growth |');
  lines.push('|--------------|-------|--------|--------|');
  for (const t of byScoreGrowth) {
    const arrow = t.score.change > 0 ? '📈' : t.score.change < 0 ? '📉' : '➡️';
    const sign = t.score.change >= 0 ? '+' : '';
    lines.push(`| ${t.leader} | ${t.score.end} | ${sign}${t.score.change} ${arrow} | ${sign}${t.score.percentChange}% |`);
  }
  lines.push('');

  // Science trends
  lines.push('## Science Trends');
  const byScienceGrowth = [...trends].sort((a, b) => b.science.change - a.science.change);
  lines.push('| Civilization | Science/turn | Change | Techs Gained |');
  lines.push('|--------------|--------------|--------|--------------|');
  for (const t of byScienceGrowth) {
    const arrow = t.science.change > 0 ? '📈' : t.science.change < 0 ? '📉' : '➡️';
    const sign = t.science.change >= 0 ? '+' : '';
    lines.push(`| ${t.leader} | ${t.science.end} | ${sign}${t.science.change} ${arrow} | +${t.techs.change} |`);
  }
  lines.push('');

  // Culture trends
  lines.push('## Culture Trends');
  const byCultureGrowth = [...trends].sort((a, b) => b.culture.change - a.culture.change);
  lines.push('| Civilization | Culture/turn | Change | Growth |');
  lines.push('|--------------|--------------|--------|--------|');
  for (const t of byCultureGrowth) {
    const arrow = t.culture.change > 0 ? '📈' : t.culture.change < 0 ? '📉' : '➡️';
    const sign = t.culture.change >= 0 ? '+' : '';
    lines.push(`| ${t.leader} | ${t.culture.end} | ${sign}${t.culture.change} ${arrow} | ${sign}${t.culture.percentChange}% |`);
  }
  lines.push('');

  // Military trends - important for threat assessment
  lines.push('## Military Trends');
  const byMilitaryGrowth = [...trends].sort((a, b) => b.military.change - a.military.change);
  lines.push('| Civilization | Units | Change | Growth |');
  lines.push('|--------------|-------|--------|--------|');
  for (const t of byMilitaryGrowth) {
    const arrow = t.military.change > 0 ? '⚔️' : t.military.change < 0 ? '📉' : '➡️';
    const sign = t.military.change >= 0 ? '+' : '';
    const warning = t.military.change >= 5 ? ' ⚠️' : '';
    lines.push(`| ${t.leader} | ${t.military.end} | ${sign}${t.military.change} ${arrow}${warning} | ${sign}${t.military.percentChange}% |`);
  }
  lines.push('');

  // Expansion trends
  lines.push('## Expansion Trends');
  const byExpansion = [...trends].sort((a, b) => b.territory.change - a.territory.change);
  lines.push('| Civilization | Cities | Territory | Change |');
  lines.push('|--------------|--------|-----------|--------|');
  for (const t of byExpansion) {
    const cityChange = t.cities.change > 0 ? `+${t.cities.change}` : t.cities.change === 0 ? '=' : `${t.cities.change}`;
    const arrow = t.territory.change > 0 ? '📈' : t.territory.change < 0 ? '📉' : '➡️';
    lines.push(`| ${t.leader} | ${t.cities.end} (${cityChange}) | ${t.territory.end} tiles | +${t.territory.change} ${arrow} |`);
  }
  lines.push('');

  // Key insights
  lines.push('## Key Insights');

  // Military buildup warning
  const militaryBuildup = trends.filter(t => t.military.change >= 3);
  if (militaryBuildup.length > 0) {
    lines.push('### Military Buildups');
    for (const t of militaryBuildup.sort((a, b) => b.military.change - a.military.change)) {
      lines.push(`- **${t.leader}**: +${t.military.change} units (+${t.military.percentChange}%) - Potential threat`);
    }
    lines.push('');
  }

  // Fastest growing
  const fastestGrowing = [...trends].sort((a, b) => b.score.percentChange - a.score.percentChange)[0];
  if (fastestGrowing && fastestGrowing.score.percentChange > 0) {
    lines.push(`### Fastest Growing: **${fastestGrowing.leader}** (+${fastestGrowing.score.percentChange}% score)`);
  }

  // Science leader acceleration
  const scienceLeader = [...trends].sort((a, b) => b.science.end - a.science.end)[0];
  if (scienceLeader && scienceLeader.science.change > 0) {
    lines.push(`### Science Leader: **${scienceLeader.leader}** at ${scienceLeader.science.end}/turn (+${scienceLeader.science.change})`);
  }

  // Declining civs
  const declining = trends.filter(t => t.score.change < 0);
  if (declining.length > 0) {
    lines.push('### Declining Civilizations');
    for (const t of declining.sort((a, b) => a.score.change - b.score.change)) {
      lines.push(`- **${t.leader}**: ${t.score.change} score (${t.score.percentChange}%)`);
    }
  }

  return lines.join('\n');
}
