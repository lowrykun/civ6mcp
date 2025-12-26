import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { unzipSync, constants } from 'zlib';
import type { SaveFileInfo, GameState, CivInfo, ModInfo } from './types.js';
import {
  getLatestTurnStatsFullCivsOnly,
  calculateVictoryProgress,
} from './history-parser.js';
import { getSavesDirectory } from './paths.js';

// Re-export for backwards compatibility
export { getSavesDirectory } from './paths.js';

const SAVE_PATH = getSavesDirectory();

// Binary markers from the save file format
const COMPRESSED_DATA_END = Buffer.from([0, 0, 0xFF, 0xFF]);
const ZLIB_HEADER = Buffer.from([0x78, 0x9C]);

// Known binary markers for game data
const MARKERS = {
  GAME_TURN: Buffer.from([0x9D, 0x2C, 0xE6, 0xBD]),
  GAME_SPEED: Buffer.from([0x99, 0xB0, 0xD9, 0x05]),
  MAP_SIZE: Buffer.from([0x40, 0x5C, 0x83, 0x0B]),
  MAP_FILE: Buffer.from([0x5A, 0x87, 0xD8, 0x63]),
};

export function listSaveFiles(filter: 'all' | 'autosave' | 'manual' | 'quicksave' = 'all'): SaveFileInfo[] {
  const saves: SaveFileInfo[] = [];

  const scanDir = (dir: string, depth = 0) => {
    if (depth > 2) return; // Don't go too deep
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          scanDir(fullPath, depth + 1);
        } else if (entry.name.endsWith('.Civ6Save')) {
          const stats = statSync(fullPath);
          const info: SaveFileInfo = {
            name: entry.name,
            path: fullPath,
            modified: stats.mtime.toISOString(),
            size: stats.size,
          };

          // Extract turn from filename
          const autoMatch = entry.name.match(/AutoSave_(\d+)/);
          if (autoMatch) {
            info.turn = parseInt(autoMatch[1], 10);
          }
          const turnMatch = entry.name.match(/(\d+)\s*(?:AD|BC)/i);
          if (turnMatch) {
            info.turn = parseInt(turnMatch[1], 10);
          }

          const leaderMatch = entry.name.match(/^([A-Z][A-Z_]+)/);
          if (leaderMatch) {
            info.leader = formatLeaderName(leaderMatch[1]);
          }

          saves.push(info);
        }
      }
    } catch {
      // Directory doesn't exist or isn't readable
    }
  };

  // Scan based on filter
  const singlePath = join(SAVE_PATH, 'Single');
  if (filter === 'all' || filter === 'manual') {
    scanDir(singlePath);
  }
  if (filter === 'autosave') {
    scanDir(join(singlePath, 'auto'));
  }
  if (filter === 'quicksave') {
    scanDir(join(singlePath, 'quick'));
  }

  // Remove duplicates by path
  const uniqueSaves = [...new Map(saves.map(s => [s.path, s])).values()];

  // Sort by modified date, newest first
  uniqueSaves.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

  // Apply filter
  if (filter === 'autosave') {
    return uniqueSaves.filter(s => s.name.startsWith('AutoSave'));
  } else if (filter === 'quicksave') {
    return uniqueSaves.filter(s => s.name.toLowerCase().includes('quicksave'));
  } else if (filter === 'manual') {
    return uniqueSaves.filter(s => !s.name.startsWith('AutoSave') && !s.name.toLowerCase().includes('quicksave'));
  }

  return uniqueSaves;
}

function readMarkerValue(buffer: Buffer, marker: Buffer): { type: number; data: string | number | boolean } | null {
  const pos = buffer.indexOf(marker);
  if (pos === -1) return null;

  const type = buffer.readUInt32LE(pos + 4);

  switch (type) {
    case 1: // Boolean
      return { type, data: buffer.readUInt32LE(pos + 16) !== 0 };
    case 2: // Integer
      return { type, data: buffer.readUInt32LE(pos + 16) };
    case 5: { // String
      const strLen = buffer.readUInt16LE(pos + 8);
      const str = buffer.toString('utf8', pos + 16, pos + 16 + strLen - 1);
      return { type, data: str };
    }
    default:
      return null;
  }
}

function decompressGameData(buffer: Buffer): Buffer | null {
  // Find the main compressed data section (after header area)
  const zlibStart = buffer.indexOf(ZLIB_HEADER, 200000);
  if (zlibStart === -1) return null;

  const endPos = buffer.indexOf(COMPRESSED_DATA_END, zlibStart);
  if (endPos === -1 || endPos <= zlibStart) return null;

  const compressedChunk = buffer.subarray(zlibStart, endPos + COMPRESSED_DATA_END.length);

  // Data is chunked - every 64KB there's 4 bytes to skip
  const chunkSize = 64 * 1024;
  const chunks: Buffer[] = [];
  let pos = 0;
  while (pos < compressedChunk.length) {
    chunks.push(compressedChunk.subarray(pos, pos + chunkSize));
    pos += chunkSize + 4;
  }
  const assembledData = Buffer.concat(chunks);

  try {
    return unzipSync(assembledData, { finishFlush: constants.Z_SYNC_FLUSH });
  } catch {
    return null;
  }
}

function extractCivsFromHeader(headerText: string): { player: CivInfo | null; aiCivs: CivInfo[]; cityStates: string[] } {
  const allCivs: CivInfo[] = [];
  const cityStates: string[] = [];

  // Strategy: Look for CIVILIZATION_LEVEL_FULL_CIV markers and find the nearest CIVILIZATION_ before them
  // After the marker, look for "Player" to identify the human player

  // Find positions of all CIVILIZATION_LEVEL_FULL_CIV markers
  const levelMarker = 'CIVILIZATION_LEVEL_FULL_CIV';
  let searchPos = 0;
  const fullCivPositions: number[] = [];
  while (true) {
    const pos = headerText.indexOf(levelMarker, searchPos);
    if (pos === -1) break;
    fullCivPositions.push(pos);
    searchPos = pos + levelMarker.length;
  }

  // For each FULL_CIV marker, look backward for the nearest CIVILIZATION_
  const seenCivs = new Set<string>();
  for (const pos of fullCivPositions) {
    // Search backward up to 500 chars for a CIVILIZATION_ pattern (not CIVILIZATION_LEVEL)
    const start = Math.max(0, pos - 500);
    const section = headerText.substring(start, pos);
    // Match CIVILIZATION_X but not CIVILIZATION_LEVEL
    const civMatches = [...section.matchAll(/CIVILIZATION_([A-Z_]+?)(?=[^A-Z_]|$)/g)];

    if (civMatches.length > 0) {
      // Take the last (closest) match that isn't LEVEL
      for (let i = civMatches.length - 1; i >= 0; i--) {
        let civ = civMatches[i][1];
        if (civ.startsWith('LEVEL')) continue;

        // Strip _NAME suffix
        civ = civ.replace(/_NAME$/, '');
        if (seenCivs.has(civ)) break;
        seenCivs.add(civ);

        // Check if "Player" appears shortly after CIVILIZATION_LEVEL_FULL_CIV
        const afterMarker = headerText.substring(pos, pos + 100);
        const isHuman = afterMarker.includes('Player');

        allCivs.push({
          leader: getLeaderForCiv(civ),
          civilization: formatEnumValue(civ),
          type: 'full_civ',
          isHuman,
        });
        break;
      }
    }
  }

  // Find city-states using CIVILIZATION_LEVEL_CITY_STATE
  const csMarker = 'CIVILIZATION_LEVEL_CITY_STATE';
  searchPos = 0;
  const csPositions: number[] = [];
  while (true) {
    const pos = headerText.indexOf(csMarker, searchPos);
    if (pos === -1) break;
    csPositions.push(pos);
    searchPos = pos + csMarker.length;
  }

  const seenCityStates = new Set<string>();
  for (const pos of csPositions) {
    const start = Math.max(0, pos - 500);
    const section = headerText.substring(start, pos);
    // Match CIVILIZATION_X (the city-state name)
    const civMatches = [...section.matchAll(/CIVILIZATION_([A-Z_]+?)(?=[^A-Z_]|$)/g)];

    if (civMatches.length > 0) {
      for (let i = civMatches.length - 1; i >= 0; i--) {
        let cs = civMatches[i][1];
        if (cs.startsWith('LEVEL')) continue;
        // Strip _NAME suffix
        cs = cs.replace(/_NAME$/, '');
        if (!seenCityStates.has(cs)) {
          seenCityStates.add(cs);
          cityStates.push(formatEnumValue(cs));
        }
        break;
      }
    }
  }

  // All civs have same pattern after marker, so we need another way to identify the player
  // For now, return all civs - player identification will happen later based on city names or other data
  return {
    player: allCivs.length > 0 ? allCivs[0] : null,  // Will be replaced by proper detection
    aiCivs: allCivs.slice(1),
    cityStates: cityStates.slice(0, 15)
  };
}

function getLeaderForCiv(civ: string): string {
  const civToLeader: Record<string, string> = {
    'VIETNAM': 'Bà Triệu',
    'GEORGIA': 'Tamar',
    'PERSIA': 'Cyrus',
    'CANADA': 'Wilfrid Laurier',
    'NETHERLANDS': 'Wilhelmina',
    'OTTOMAN': 'Suleiman',
    'ROME': 'Trajan',
    'EGYPT': 'Cleopatra',
    'MACEDON': 'Alexander',
    'SUMERIA': 'Gilgamesh',
    'INDIA': 'Gandhi',
    'CHINA': 'Qin Shi Huang',
    'RUSSIA': 'Peter the Great',
    'ENGLAND': 'Victoria',
    'AZTEC': 'Montezuma',
    'GERMANY': 'Barbarossa',
    'GREECE': 'Pericles',
    'JAPAN': 'Hojo',
    'KONGO': 'Mvemba a Nzinga',
    'BRAZIL': 'Pedro II',
    'NORWAY': 'Harald Hardrada',
    'SCYTHIA': 'Tomyris',
    'SPAIN': 'Philip II',
    'POLAND': 'Jadwiga',
    'ARABIA': 'Saladin',
    'INDONESIA': 'Gitarja',
    'KHMER': 'Jayavarman VII',
    'AUSTRALIA': 'John Curtin',
    'ZULU': 'Shaka',
    'MONGOLIA': 'Genghis Khan',
    'SCOTLAND': 'Robert the Bruce',
    'GAUL': 'Ambiorix',
    'NUBIA': 'Amanitore',
  };
  return civToLeader[civ] || formatEnumValue(civ);
}

function getCivForLeader(leader: string): string {
  const leaderToCiv: Record<string, string> = {
    'LADY_TRIEU': 'Vietnam',
    'TAMAR': 'Georgia',
    'CYRUS': 'Persia',
    'LAURIER': 'Canada',
    'WILHELMINA': 'Netherlands',
    'SULEIMAN': 'Ottoman',
    'SULEIMAN_ALT': 'Ottoman',
    'TRAJAN': 'Rome',
    'CLEOPATRA': 'Egypt',
    'ALEXANDER': 'Macedon',
    'GILGAMESH': 'Sumeria',
    'GANDHI': 'India',
    'QIN': 'China',
    'PETER_GREAT': 'Russia',
    'VICTORIA': 'England',
    'MONTEZUMA': 'Aztec',
    'BARBAROSSA': 'Germany',
    'GORGO': 'Greece',
    'PERICLES': 'Greece',
    'HOJO': 'Japan',
    'MVEMBA': 'Kongo',
    'PEDRO': 'Brazil',
    'HARDRADA': 'Norway',
    'TOMYRIS': 'Scythia',
    'PHILIP_II': 'Spain',
    'JADWIGA': 'Poland',
    'SALADIN': 'Arabia',
    'GITARJA': 'Indonesia',
    'JAYAVARMAN': 'Khmer',
    'JOHN_CURTIN': 'Australia',
    'SHAKA': 'Zulu',
    'GENGHIS_KHAN': 'Mongolia',
    'ROBERT_THE_BRUCE': 'Scotland',
    'CHANDRAGUPTA': 'India',
    'AMBIORIX': 'Gaul',
  };
  return leaderToCiv[leader] || formatEnumValue(leader.replace(/_ALT$/, ''));
}

export function parseSaveFile(filePath: string): GameState {
  const buffer = readFileSync(filePath);

  // Verify magic bytes
  const magic = buffer.subarray(0, 4).toString('ascii');
  if (magic !== 'CIV6') {
    throw new Error(`Invalid Civ6 save file: expected CIV6 magic bytes, got ${magic}`);
  }

  // Read header section
  const headerSection = buffer.subarray(0, Math.min(buffer.length, 150000)).toString('utf8');

  // Extract turn from binary marker
  let turn = 0;
  const turnData = readMarkerValue(buffer, MARKERS.GAME_TURN);
  if (turnData && typeof turnData.data === 'number') {
    turn = turnData.data;
  }
  // Fallback: try filename
  if (!turn) {
    const filename = basename(filePath);
    const autoMatch = filename.match(/AutoSave_(\d+)/);
    if (autoMatch) turn = parseInt(autoMatch[1], 10);
  }

  // Extract game speed
  let gameSpeed = 'Standard';
  const speedData = readMarkerValue(buffer, MARKERS.GAME_SPEED);
  if (speedData && typeof speedData.data === 'string') {
    gameSpeed = formatEnumValue(speedData.data.replace('GAMESPEED_', ''));
  }

  // Extract map size
  let mapSize = 'Unknown';
  const sizeData = readMarkerValue(buffer, MARKERS.MAP_SIZE);
  if (sizeData && typeof sizeData.data === 'string') {
    mapSize = formatEnumValue(sizeData.data.replace('MAPSIZE_', ''));
  }

  // Extract map type
  let mapType = 'Unknown';
  const mapMatch = headerSection.match(/"LOC_MAP_([A-Z_]+)":\[/);
  if (mapMatch) {
    mapType = formatEnumValue(mapMatch[1]);
  }

  // Extract era
  let era = 'Unknown';
  const eraMatch = headerSection.match(/"LOC_ERA_([A-Z]+)_NAME"/);
  if (eraMatch) {
    era = formatEnumValue(eraMatch[1]);
  }

  // Extract difficulty
  let difficulty = 'Unknown';
  const diffMatch = headerSection.match(/DIFFICULTY_([A-Z]+)(?![A-Z_])/);
  if (diffMatch) {
    difficulty = formatEnumValue(diffMatch[1]);
  }

  // Extract game version
  let gameVersion = 'Unknown';
  const versionMatch = headerSection.match(/(\d+\.\d+\.\d+)\s*\((\d+)\)/);
  if (versionMatch) {
    gameVersion = `${versionMatch[1]} (${versionMatch[2]})`;
  }

  // Extract all civs from header
  const { player: headerPlayer, aiCivs: headerAiCivs, cityStates: headerCityStates } = extractCivsFromHeader(headerSection);
  let allCivs = headerPlayer ? [headerPlayer, ...headerAiCivs] : [...headerAiCivs];

  // Extract mods
  const mods: ModInfo[] = [];
  const modMatches = headerSection.matchAll(/([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})\s*\{"LOC_([A-Z_]+)_MOD_TITLE"/gi);
  for (const match of modMatches) {
    const modId = match[1];
    const modName = formatEnumValue(match[2].replace(/_MOD_TITLE$/, ''));
    if (!mods.find(m => m.id === modId)) {
      mods.push({ id: modId, title: modName });
    }
  }

  // Try to get additional data from decompressed section
  let decompressedInfo: DecompressedInfo | null = null;
  try {
    const decompressed = decompressGameData(buffer);
    if (decompressed) {
      decompressedInfo = analyzeDecompressedData(decompressed);
    }
  } catch {
    // Decompression failed, continue with header data
  }

  // Identify player civ based on player cities
  let playerCiv: CivInfo | null = null;
  let otherCivs: CivInfo[] = [];

  if (decompressedInfo?.playerCities && decompressedInfo.playerCities.length > 0) {
    // Find which civ matches the player cities based on known city-civ mappings
    const playerCivName = identifyCivFromCities(decompressedInfo.playerCities);
    if (playerCivName) {
      // Find this civ in our list
      const matchIndex = allCivs.findIndex(c =>
        c.civilization.toUpperCase() === playerCivName.toUpperCase());
      if (matchIndex >= 0) {
        playerCiv = allCivs[matchIndex];
        playerCiv.isHuman = true;
        otherCivs = allCivs.filter((_, i) => i !== matchIndex);
      }
    }
  }

  // Fallback: use first civ as player
  if (!playerCiv && allCivs.length > 0) {
    playerCiv = allCivs[0];
    otherCivs = allCivs.slice(1);
  }

  // Mark all other civs as AI (not human)
  for (const civ of otherCivs) {
    civ.isHuman = false;
  }

  return {
    leader: playerCiv?.leader || 'Unknown',
    civilization: playerCiv?.civilization || 'Unknown',
    turn,
    era,
    difficulty,
    mapType,
    mapSize,
    gameSpeed,
    gameVersion,
    otherCivs,
    // Prefer header city-states as they're more reliably detected
    cityStates: headerCityStates.length > 0 ? headerCityStates : (decompressedInfo?.cityStates || []),
    mods,
    // Extended info from decompressed data
    ...(decompressedInfo && {
      technologies: decompressedInfo.technologies,
      civics: decompressedInfo.civics,
      wonders: decompressedInfo.wonders,
      greatPeople: decompressedInfo.greatPeople,
      playerCities: decompressedInfo.playerCities,
    }),
  };
}

// Map known cities to their civilization
function identifyCivFromCities(cities: string[]): string | null {
  const cityToCiv: Record<string, string> = {
    'Hue': 'VIETNAM', 'Da Nang': 'VIETNAM', 'Hanoi': 'VIETNAM', 'Saigon': 'VIETNAM',
    'Nha Trang': 'VIETNAM', 'Can Tho': 'VIETNAM', 'Hai Phong': 'VIETNAM', 'Vinh': 'VIETNAM',
    'Thang Long': 'VIETNAM', 'Bien Hoa': 'VIETNAM',
    'Tbilisi': 'GEORGIA', 'Kutaisi': 'GEORGIA', 'Batumi': 'GEORGIA',
    'Persepolis': 'PERSIA', 'Pasargadae': 'PERSIA', 'Susa': 'PERSIA',
    'Ottawa': 'CANADA', 'Toronto': 'CANADA', 'Montreal': 'CANADA',
    'Amsterdam': 'NETHERLANDS', 'Rotterdam': 'NETHERLANDS', 'The Hague': 'NETHERLANDS',
    'Istanbul': 'OTTOMAN', 'Ankara': 'OTTOMAN', 'Edirne': 'OTTOMAN',
    'Rome': 'ROME', 'Antium': 'ROME', 'Cumae': 'ROME',
    'Alexandria': 'EGYPT', 'Thebes': 'EGYPT', 'Memphis': 'EGYPT',
  };

  for (const city of cities) {
    const civ = cityToCiv[city];
    if (civ) return civ;
  }
  return null;
}

interface DecompressedInfo {
  technologies: string[];
  civics: string[];
  wonders: string[];
  greatPeople: string[];
  cityStates: string[];
  playerCities: string[];
}

function analyzeDecompressedData(data: Buffer): DecompressedInfo {
  const text = data.toString('utf8');

  // Extract technologies (ones that appear to be researched)
  const techs = [...new Set((text.match(/TECH_[A-Z_]+/g) || [])
    .filter(t => !t.includes('BOOST') && !t.includes('GRANT')))];

  // Extract civics
  const civics = [...new Set((text.match(/CIVIC_[A-Z_]+/g) || []))];

  // Extract wonders that are likely built (not just references)
  const wonderMatches = [...new Set((text.match(/BUILDING_[A-Z_]+/g) || [])
    .filter(b => isWonder(b)))];
  // Clean and deduplicate wonder names
  const wonderNamesClean = [...new Set(wonderMatches.map(w => cleanWonderName(w)))];

  // Extract great people
  const greatPeople = [...new Set((text.match(/GREAT_PERSON_INDIVIDUAL_[A-Z_]+_NAME/g) || []))]
    .map(gp => formatGreatPersonName(gp));

  // Extract city names (LOC_CITY_NAME patterns)
  const cityNames = [...new Set((text.match(/LOC_CITY_NAME_([A-Z_]+)/g) || []))]
    .map(c => formatEnumValue(c.replace('LOC_CITY_NAME_', '')));

  // Try to identify player cities (Vietnam cities for Lady Trieu)
  const vietnamCities = ['THANG_LONG', 'HUE', 'HANOI', 'SAIGON', 'DA_NANG', 'HAI_PHONG', 'NHA_TRANG', 'CAN_THO', 'BIEN_HOA', 'VINH'];
  const playerCities = vietnamCities
    .filter(c => text.includes(c))
    .map(c => formatEnumValue(c));

  // City-states active in the game
  const cityStates = [...new Set((text.match(/CIVILIZATION_([A-Z_]+)/g) || []))]
    .map(c => c.replace('CIVILIZATION_', ''))
    .filter(c => isCityState(c))
    .map(c => formatEnumValue(c));

  return {
    technologies: techs.slice(0, 20).map(t => formatEnumValue(t.replace('TECH_', ''))),
    civics: civics.slice(0, 20).map(c => formatEnumValue(c.replace('CIVIC_', ''))),
    wonders: wonderNamesClean.slice(0, 15),
    greatPeople: greatPeople.slice(0, 15),
    cityStates: cityStates.slice(0, 12),
    playerCities,
  };
}

const WONDER_NAMES = new Set([
  'PYRAMIDS', 'STONEHENGE', 'HANGING_GARDENS', 'ORACLE', 'COLOSSEUM', 'PETRA',
  'TERRACOTTA_ARMY', 'MACHU_PICCHU', 'GREAT_LIBRARY', 'GREAT_LIGHTHOUSE',
  'COLOSSUS', 'ALHAMBRA', 'CHICHEN_ITZA', 'ANGKOR_WAT', 'MONT_ST_MICHEL',
  'FORBIDDEN_CITY', 'TAJ_MAHAL', 'POTALA_PALACE', 'ST_BASILS_CATHEDRAL',
  'BIG_BEN', 'HERMITAGE', 'BOLSHOI_THEATRE', 'OXFORD_UNIVERSITY',
  'RUHR_VALLEY', 'STATUE_OF_LIBERTY', 'EIFFEL_TOWER', 'BROADWAY',
  'CRISTO_REDENTOR', 'SYDNEY_OPERA_HOUSE', 'PANAMA_CANAL', 'VENETIAN_ARSENAL',
  'GREAT_ZIMBABWE', 'APADANA', 'HUEY_TEOCALLI', 'JEBEL_BARKAL', 'KILWA_KISIWANI',
  'KOTOKU_IN', 'MEENAKSHI_TEMPLE', 'STATUE_OF_ZEUS', 'TEMPLE_OF_ARTEMIS',
  'AMUNDSEN_SCOTT', 'BIOSPHERE', 'CASA_DE_CONTRATACION', 'GOLDEN_GATE_BRIDGE',
  'GREAT_BATH', 'HAGIA_SOPHIA', 'MAUSOLEUM_HALICARNASSUS',
]);

function isWonder(building: string): boolean {
  // Extract just the wonder name part
  const name = building.replace('BUILDING_', '');
  return [...WONDER_NAMES].some(w => name.startsWith(w));
}

function cleanWonderName(building: string): string {
  let name = building.replace('BUILDING_', '');
  // Remove common suffixes that are localization variants
  const suffixes = ['_NAME', '_GOLD', '_PRODUCTION', '_CULTURE', '_FAITH', '_SCIENCE',
                    '_DESCRIPTION', '_RANDOMCIVICBOOST', '_RANDOMTECHBOOST', '_QUOTE'];
  for (const suffix of suffixes) {
    if (name.endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
      break;
    }
  }
  return formatEnumValue(name);
}

function isCityState(civ: string): boolean {
  const cityStates = [
    'HATTUSA', 'KABUL', 'SINGAPORE', 'NGAZARGAMU', 'HUNZA', 'LA_VENTA', 'AKKAD',
    'TARUGA', 'BRUSSELS', 'GENEVA', 'BABYLON', 'MUSCAT', 'VALLETTA', 'BUENOS_AIRES',
    'ANTANANARIVO', 'ZANZIBAR', 'KUMASI', 'VILNIUS', 'BOLOGNA', 'FEZ', 'JERUSALEM',
    'KANDY', 'YEREVAN', 'VATICAN_CITY', 'AUCKLAND', 'GRANADA', 'CAHOKIA',
    'MITLA', 'JOHANNESBURG', 'NAZCA', 'AYUTTHAYA', 'CAGUANA', 'CHINGUETTI',
    'HONG_KONG', 'MOHENJO_DARO', 'NAN_MADOL', 'PRESLAV', 'RAPA_NUI', 'TORONTO',
    'WOLIN', 'ARMAGH', 'LAHORE', 'SAMARKAND', 'MOGADISHU', 'NALANDA',
  ];
  return cityStates.some(cs => civ.includes(cs));
}

function formatEnumValue(value: string): string {
  return value
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function formatLeaderName(name: string): string {
  const specialCases: Record<string, string> = {
    'LADY_TRIEU': 'Bà Triệu',
    'LADY_SIX_SKY': 'Lady Six Sky',
    'PETER_GREAT': 'Peter the Great',
    'T_ROOSEVELT': 'Teddy Roosevelt',
    'CATHERINE_DE_MEDICI': 'Catherine de Medici',
    'ROBERT_THE_BRUCE': 'Robert the Bruce',
    'JOHN_CURTIN': 'John Curtin',
    'QIN': 'Qin Shi Huang',
    'KUBLAI_KHAN_CHINA': 'Kublai Khan',
    'GENGHIS_KHAN': 'Genghis Khan',
    'SIMON_BOLIVAR': 'Simón Bolívar',
    'MANSA_MUSA': 'Mansa Musa',
    'WU_ZETIAN': 'Wu Zetian',
    'SULEIMAN_ALT': 'Suleiman',
    'LAURIER': 'Wilfrid Laurier',
  };
  return specialCases[name] || formatEnumValue(name);
}

function formatGreatPersonName(raw: string): string {
  return raw
    .replace('GREAT_PERSON_INDIVIDUAL_', '')
    .replace('_NAME', '')
    .split('_')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

export function generateStrategyBrief(state: GameState): string {
  const lines: string[] = [];

  lines.push(`# Civilization VI Strategy Brief`);
  lines.push('');
  lines.push(`## Current Game State`);
  lines.push(`- **Leader**: ${state.leader} of ${state.civilization}`);
  lines.push(`- **Turn**: ${state.turn}`);
  lines.push(`- **Era**: ${state.era}`);
  lines.push(`- **Difficulty**: ${state.difficulty}`);
  lines.push('');
  lines.push(`## Map Settings`);
  lines.push(`- **Type**: ${state.mapType}`);
  lines.push(`- **Size**: ${state.mapSize}`);
  lines.push(`- **Speed**: ${state.gameSpeed}`);
  lines.push('');

  // Player cities
  const extState = state as GameState & { playerCities?: string[] };
  if (extState.playerCities && extState.playerCities.length > 0) {
    lines.push(`## Your Cities (${extState.playerCities.length} found)`);
    lines.push(extState.playerCities.join(', '));
    lines.push('');
  }

  // Add statistics from game history logging if available
  let stats: ReturnType<typeof getLatestTurnStatsFullCivsOnly> = null;
  try {
    stats = getLatestTurnStatsFullCivsOnly();
  } catch {
    // Log files don't exist or can't be read - that's fine
  }
  if (stats && stats.length > 0) {
    // Find the player's stats
    const playerStats = stats.find(s =>
      s.civilization.toLowerCase().includes(state.civilization.toLowerCase()) ||
      state.civilization.toLowerCase().includes(s.civilization.toLowerCase())
    );

    if (playerStats) {
      lines.push(`## Your Empire Status (Turn ${playerStats.turn})`);
      lines.push(`- **Population**: ${playerStats.population} across ${playerStats.cities} cities`);
      lines.push(`- **Science**: ${playerStats.sciencePerTurn}/turn (${playerStats.techsResearched} techs researched)`);
      lines.push(`- **Culture**: ${playerStats.culturePerTurn}/turn (${playerStats.civicsResearched} civics researched)`);
      lines.push(`- **Gold**: ${playerStats.goldPerTurn}/turn (${playerStats.goldBalance} in treasury)`);
      lines.push(`- **Faith**: ${playerStats.faithPerTurn}/turn (${playerStats.faithBalance} accumulated)`);
      lines.push(`- **Military**: ${playerStats.landUnits} land units, ${playerStats.navalUnits} naval units`);
      lines.push(`- **Territory**: ${playerStats.tilesOwned} tiles owned, ${playerStats.tilesImproved} improved`);
      lines.push('');
    }

    // Victory Progress
    const progress = calculateVictoryProgress(stats);
    if (progress.length > 0) {
      const playerProgress = progress.find(p =>
        p.civilization.toLowerCase().includes(state.civilization.toLowerCase()) ||
        state.civilization.toLowerCase().includes(p.civilization.toLowerCase())
      );

      if (playerProgress) {
        lines.push(`## Victory Progress`);
        lines.push(`- **Science Victory**: Position #${playerProgress.science.position} (${playerProgress.science.techsResearched} techs, ${playerProgress.science.sciencePerTurn}/turn)`);
        lines.push(`- **Culture Victory**: Position #${playerProgress.culture.position} (${playerProgress.culture.culturePerTurn} culture/turn)`);
        lines.push(`- **Domination**: Position #${playerProgress.domination.position} (${playerProgress.domination.militaryStrength} military units)`);
        lines.push(`- **Overall Score**: Position #${playerProgress.score.position}`);
        lines.push('');
      }

      // Show leaders in each category
      const scienceLeader = progress.find(p => p.science.position === 1);
      const cultureLeader = progress.find(p => p.culture.position === 1);
      const militaryLeader = progress.find(p => p.domination.position === 1);

      lines.push(`## Victory Leaders`);
      if (scienceLeader) {
        lines.push(`- **Science**: ${scienceLeader.leader} (${scienceLeader.science.techsResearched} techs, ${scienceLeader.science.sciencePerTurn}/turn)`);
      }
      if (cultureLeader) {
        lines.push(`- **Culture**: ${cultureLeader.leader} (${cultureLeader.culture.culturePerTurn}/turn)`);
      }
      if (militaryLeader) {
        lines.push(`- **Military**: ${militaryLeader.leader} (${militaryLeader.domination.militaryStrength} units)`);
      }
      lines.push('');
    }

    // Comparison table of all civs
    lines.push(`## Civilization Comparison`);
    const sorted = [...stats].sort((a, b) => b.population - a.population);
    lines.push('| Civ | Pop | Cities | Sci/t | Cul/t | Gold/t | Military |');
    lines.push('|-----|-----|--------|-------|-------|--------|----------|');
    for (const s of sorted) {
      const mil = s.landUnits + s.navalUnits;
      const isPlayer = s.civilization.toLowerCase().includes(state.civilization.toLowerCase()) ||
        state.civilization.toLowerCase().includes(s.civilization.toLowerCase());
      const marker = isPlayer ? '**' : '';
      lines.push(`| ${marker}${s.leader}${marker} | ${s.population} | ${s.cities} | ${s.sciencePerTurn} | ${s.culturePerTurn} | ${s.goldPerTurn} | ${mil} |`);
    }
    lines.push('');
  }

  if (state.otherCivs.length > 0) {
    lines.push(`## Other Civilizations (${state.otherCivs.length})`);
    for (const civ of state.otherCivs) {
      lines.push(`- **${civ.leader}** of ${civ.civilization}`);
    }
    lines.push('');
  }

  if (state.cityStates.length > 0) {
    lines.push(`## City-States (${state.cityStates.length})`);
    lines.push(state.cityStates.join(', '));
    lines.push('');
  }

  // Extended info
  const ext = state as GameState & DecompressedInfo;
  if (ext.wonders && ext.wonders.length > 0) {
    lines.push(`## Wonders Built`);
    lines.push(ext.wonders.join(', '));
    lines.push('');
  }

  if (ext.greatPeople && ext.greatPeople.length > 0) {
    lines.push(`## Great People`);
    lines.push(ext.greatPeople.slice(0, 10).join(', '));
    lines.push('');
  }

  if (state.mods.length > 0) {
    lines.push(`## Active Mods (${state.mods.length})`);
    for (const mod of state.mods.slice(0, 5)) {
      lines.push(`- ${mod.title}`);
    }
    if (state.mods.length > 5) {
      lines.push(`- ... and ${state.mods.length - 5} more`);
    }
    lines.push('');
  }

  lines.push(`## Game Version`);
  lines.push(state.gameVersion);

  return lines.join('\n');
}
