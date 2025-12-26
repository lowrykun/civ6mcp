export interface SaveFileInfo {
  name: string;
  path: string;
  modified: string;
  size: number;
  leader?: string;
  turn?: number;
}

export interface GameState {
  // Basic info
  leader: string;
  civilization: string;
  turn: number;
  era: string;
  difficulty: string;

  // Map settings
  mapType: string;
  mapSize: string;
  gameSpeed: string;

  // Game version
  gameVersion: string;

  // Other players
  otherCivs: CivInfo[];
  cityStates: string[];

  // Mods
  mods: ModInfo[];
}

export interface CivInfo {
  leader: string;
  civilization: string;
  type: 'full_civ' | 'city_state' | 'free_cities';
  isHuman?: boolean;
  isCurrentTurn?: boolean;
}

export interface ModInfo {
  id: string;
  title: string;
}

export interface ParsedHeader {
  gameSpeed?: string;
  mapSize?: string;
  mapType?: string;
  difficulty?: string;
  era?: string;
  leader?: string;
  civilization?: string;
  gameVersion?: string;
  civs: CivInfo[];
  mods: ModInfo[];
}

// Statistics from XML game history logging
export interface CivStatistics {
  civilization: string;
  leader: string;
  rawCivName: string; // Original CIVILIZATION_XXX name for filtering
  isCityState: boolean;
  turn: number;
  score: number;
  cities: number;
  population: number;
  // Yields per turn
  sciencePerTurn: number;
  culturePerTurn: number;
  goldPerTurn: number;
  faithPerTurn: number;
  // Military
  landUnits: number;
  navalUnits: number;
  // Resources
  goldBalance: number;
  faithBalance: number;
  // Technology/Civics
  techsResearched: number;
  civicsResearched: number;
  // Territory
  tilesOwned: number;
  tilesImproved: number;
}

export interface VictoryProgress {
  civilization: string;
  leader: string;
  science: {
    position: number;
    techsResearched: number;
    sciencePerTurn: number;
  };
  culture: {
    position: number;
    domesticTourists: number;
    visitingTourists: number;
    culturePerTurn: number;
  };
  domination: {
    position: number;
    militaryStrength: number;
    capitalsControlled: number;
  };
  diplomatic: {
    position: number;
    diplomaticVictoryPoints: number;
  };
  religion: {
    position: number;
    citiesFollowingReligion: number;
  };
  score: {
    position: number;
    totalScore: number;
  };
}

export interface GameHistory {
  turns: TurnData[];
  civilizations: string[];
}

export interface TurnData {
  turn: number;
  civStats: CivStatistics[];
}

// ============ Log Mining Types ============

// Diplomacy
export interface DiplomaticRelation {
  fromCiv: string;
  toCiv: string;
  fromPlayerId: number;
  toPlayerId: number;
  state: string;  // ALLIED, FRIENDLY, DENOUNCED, WAR, etc.
  score: number;
  threat: number;
  trust: number;
}

export interface DiplomaticModifier {
  turn: number;
  player: string;
  playerId: number;
  opponent: string;
  opponentId: number;
  modifier: string;
  action: string;  // Activate, Update, etc.
  value: number;
  maxValue: number;
  cooldownTurns: number;
}

// Military
export interface MilitaryIntelligence {
  turn: number;
  civilization: string;
  playerId: number;
  regionalStrength: number;
  enemyStrength: number;
  otherStrength: number;
  combatDesire: number;  // 0-20 scale, higher = more aggressive
  favoriteTech: string;
  currentExplorers: number;
  desiredExplorers: number;
}

// Combat
export interface CombatRecord {
  turn: number;
  attackerCiv: string;
  defenderCiv: string;
  attackerId: number;
  defenderId: number;
  attackerUnit: string;
  defenderUnit: string;
  attackerStrength: number;
  defenderStrength: number;
  attackerDamage: number;
  defenderDamage: number;
}

// Production
export interface CityProduction {
  turn: number;
  city: string;
  cityDisplayName: string;
  currentItem: string;
  itemDisplayName: string;
  productionPerTurn: number;
  currentProgress: number;
  productionNeeded: number;
  turnsRemaining: number;
  overflow: number;
}

// Tech
export interface TechProgress {
  turn: number;
  civilization: string;
  playerId: number;
  tech: string;
  status: string;  // OWNED, RESEARCHING, etc.
  turnsRemaining: number;
}

// World Congress
export interface CongressVote {
  turn: number;
  resolution: string;
  playerId: number;
  player: string;
  votes: number;
  targetOption: number;
}

export interface CongressResult {
  turn: number;
  resolution: string;
  winningOption: number;
  voteCount: number;
}

// Great People
export interface GreatPersonEvent {
  turn: number;
  event: string;  // "Granted to Player", "Added to Timeline"
  individual: string;
  displayName: string;
  gpClass: string;
  era: string;
  cost: number;
  recipientId: number;
  recipient: string | null;
}

// Strategic Overview
export interface StrategicThreat {
  civilization: string;
  threatLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  details: string;
}

export interface StrategicOpportunity {
  civilization: string;
  type: string;
  suggestion: string;
}

// Trend Analysis
export interface CivTrend {
  civilization: string;
  leader: string;
  turnsAnalyzed: number;
  startTurn: number;
  endTurn: number;
  score: { start: number; end: number; change: number; percentChange: number };
  science: { start: number; end: number; change: number; percentChange: number };
  culture: { start: number; end: number; change: number; percentChange: number };
  gold: { start: number; end: number; change: number; percentChange: number };
  military: { start: number; end: number; change: number; percentChange: number };
  cities: { start: number; end: number; change: number };
  territory: { start: number; end: number; change: number; percentChange: number };
  techs: { start: number; end: number; change: number };
}
