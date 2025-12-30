#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  listSaveFiles,
  parseSaveFile,
  generateStrategyBrief,
  getSavesDirectory,
} from './parser.js';
import {
  findHistoryFile,
  getLogsDirectory,
  getLatestTurnStats,
  getLatestTurnStatsFullCivsOnly,
  getStatsForTurn,
  calculateVictoryProgress,
  formatStatsComparison,
  formatVictoryProgress,
  analyzeTrends,
  formatTrendAnalysis,
} from './history-parser.js';
import {
  parseDiplomacy,
  parseDiplomacyModifiers,
  parseMilitaryIntel,
  parseCombatLog,
  parseCityProduction,
  parseCityFoundingStats,
  parseTechStatus,
  parseWorldCongress,
  parseGreatPeople,
  parseCulturalGreatPeople,
  parseScoreBreakdown,
  formatDiplomacyStatus,
  formatDiplomacyModifiers,
  formatMilitaryIntelligence,
  formatCombatLog,
  formatCityProduction,
  formatCityStatus,
  formatTechStatus,
  formatWorldCongress,
  formatGreatPeople,
  formatCulturalGreatPeople,
  formatScoreBreakdown,
  generateStrategicOverview,
} from './logs-parser.js';

// In-memory storage for game context notes
const gameContext: Map<string, string> = new Map();

const server = new Server(
  {
    name: 'civ6mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tool schemas
const ListSavesSchema = z.object({
  filter: z.enum(['all', 'autosave', 'manual', 'quicksave']).optional().default('all'),
});

const ReadGameStateSchema = z.object({
  save_path: z.string().describe('Full path to the .Civ6Save file'),
});

const GetStrategyBriefSchema = z.object({
  save_path: z.string().describe('Full path to the .Civ6Save file'),
});

const SetGameContextSchema = z.object({
  context: z.string().describe('Game context information (yields, military, cities, goals, etc.)'),
});

const GetGameContextSchema = z.object({});

const GetCivStatisticsSchema = z.object({
  turn: z.number().optional().describe('Specific turn number to get stats for. Defaults to latest turn.'),
});

const GetVictoryProgressSchema = z.object({});

const GetYieldComparisonSchema = z.object({});

// New log mining tool schemas
const GetDiplomaticStatusSchema = z.object({
  civilization: z.string().optional().describe('Filter to show relations for a specific civilization'),
});

const GetDiplomaticModifiersSchema = z.object({
  civilization: z.string().optional().describe('Filter to show modifiers for a specific civilization'),
});

const GetMilitaryIntelligenceSchema = z.object({});

const GetCombatLogSchema = z.object({
  turns: z.number().optional().default(5).describe('Number of recent turns to show'),
});

const GetCityProductionSchema = z.object({
  civilization: z.string().optional().describe('Filter to show production for a specific civilization'),
});

const GetCityStatusSchema = z.object({
  player_id: z.number().optional().default(0).describe('Player ID (default: 0 for human player)'),
});

const GetTechStatusSchema = z.object({});

const GetWorldCongressSchema = z.object({});

const GetGreatPeopleSchema = z.object({});

const GetCulturalGreatPeopleSchema = z.object({});

const GetScoreBreakdownSchema = z.object({});

const GetStrategicOverviewSchema = z.object({
  civilization: z.string().optional().describe('Your civilization name for personalized analysis'),
});

const GetTrendAnalysisSchema = z.object({
  turns: z.number().optional().default(10).describe('Number of turns to analyze (default: 10)'),
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_saves',
        description: `List all Civilization VI save files. Saves are located at: ${getSavesDirectory()}`,
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              enum: ['all', 'autosave', 'manual', 'quicksave'],
              description: 'Filter saves by type. Default: all',
            },
          },
        },
      },
      {
        name: 'read_game_state',
        description: 'Parse a Civilization VI save file and return the current game state including leader, civilization, era, difficulty, and other players',
        inputSchema: {
          type: 'object',
          properties: {
            save_path: {
              type: 'string',
              description: 'Full path to the .Civ6Save file',
            },
          },
          required: ['save_path'],
        },
      },
      {
        name: 'get_strategy_brief',
        description: 'Get a formatted strategy briefing from a Civilization VI save file, suitable for discussing strategy and next moves',
        inputSchema: {
          type: 'object',
          properties: {
            save_path: {
              type: 'string',
              description: 'Full path to the .Civ6Save file',
            },
          },
          required: ['save_path'],
        },
      },
      {
        name: 'set_game_context',
        description: 'Store additional game context that cannot be parsed from the save file (e.g., current yields, military strength, cities, technologies, goals, diplomatic relations). This information will be included in strategy briefs.',
        inputSchema: {
          type: 'object',
          properties: {
            context: {
              type: 'string',
              description: 'Game context information. Can include: Gold/Science/Culture/Faith per turn, Military strength, City names and populations, Key technologies/civics, Current goals, Relations with other civs, etc.',
            },
          },
          required: ['context'],
        },
      },
      {
        name: 'get_game_context',
        description: 'Retrieve the stored game context information',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_civ_statistics',
        description: 'Get detailed statistics for ALL civilizations including yields, military, cities, and score. Requires game history logging to be enabled (GameHistoryLogLevel=1 in UserOptions.txt).',
        inputSchema: {
          type: 'object',
          properties: {
            turn: {
              type: 'number',
              description: 'Specific turn number to get stats for. Defaults to latest available turn.',
            },
          },
        },
      },
      {
        name: 'get_victory_progress',
        description: 'Get victory progress positions for all civilizations across Science, Culture, Domination, and Score victories. Shows who is leading each victory type.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_yield_comparison',
        description: 'Get a comparison table of all civilizations\' yields (science, culture, gold, faith per turn), cities, and military strength.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      // New log mining tools
      {
        name: 'get_diplomatic_status',
        description: 'Get diplomatic relationships between all civilizations including alliance status, friendship, denouncements, and wars.',
        inputSchema: {
          type: 'object',
          properties: {
            civilization: {
              type: 'string',
              description: 'Filter to show relations for a specific civilization',
            },
          },
        },
      },
      {
        name: 'get_diplomatic_modifiers',
        description: 'Get specific diplomatic modifiers explaining why civilizations like or dislike each other (e.g., "Allied with a friend +8", "Denounced them -9").',
        inputSchema: {
          type: 'object',
          properties: {
            civilization: {
              type: 'string',
              description: 'Filter to show modifiers for a specific civilization',
            },
          },
        },
      },
      {
        name: 'get_military_intelligence',
        description: 'Get military strength, combat desire (aggressiveness), and preferred military tech targets for all civilizations.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_combat_log',
        description: 'Get recent combat history showing battles, units involved, damage dealt, and active conflicts.',
        inputSchema: {
          type: 'object',
          properties: {
            turns: {
              type: 'number',
              description: 'Number of recent turns to show (default: 5)',
            },
          },
        },
      },
      {
        name: 'get_city_production',
        description: 'Get what every city is currently building, including strategic items like Giant Death Robots, Manhattan Project, and space race projects.',
        inputSchema: {
          type: 'object',
          properties: {
            civilization: {
              type: 'string',
              description: 'Filter to show production for a specific civilization',
            },
          },
        },
      },
      {
        name: 'get_city_status',
        description: 'Get status of your cities including food advantage at founding (indicates growth potential) and current production. Cities with negative food advantage will struggle to grow without improvements like Granaries or Farms.',
        inputSchema: {
          type: 'object',
          properties: {
            player_id: {
              type: 'number',
              description: 'Player ID (default: 0 for human player)',
            },
          },
        },
      },
      {
        name: 'get_tech_status',
        description: 'Get technology research progress for all civilizations.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_world_congress',
        description: 'Get World Congress voting records and resolution outcomes.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_great_people',
        description: 'Get Great People that have been claimed and those available for recruitment.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_great_people_culture',
        description: 'Track Great Artists, Writers, and Musicians for cultural victory analysis. Shows who is collecting cultural Great People, how many Great Works have been created, and who is leading the culture race.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_score_breakdown',
        description: 'Get detailed score breakdown by category (Empire, Tech, Civics, Wonders, Great People, Religion) for all civilizations. Shows why each civ is ahead or behind and identifies your strengths and gaps.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_strategic_overview',
        description: 'Get a comprehensive strategic briefing combining threats, opportunities, active conflicts, victory race positions, and key production to watch.',
        inputSchema: {
          type: 'object',
          properties: {
            civilization: {
              type: 'string',
              description: 'Your civilization name for personalized threat/opportunity analysis',
            },
          },
        },
      },
      {
        name: 'get_trend_analysis',
        description: 'Analyze trends over multiple turns showing how each civilization\'s score, science, culture, military, and territory are changing. Highlights military buildups, fastest growing civs, and declining powers.',
        inputSchema: {
          type: 'object',
          properties: {
            turns: {
              type: 'number',
              description: 'Number of turns to analyze (default: 10)',
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_saves': {
        const parsed = ListSavesSchema.parse(args);
        const saves = listSaveFiles(parsed.filter);

        if (saves.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No save files found with filter: ${parsed.filter}\n\nSave directory: ${getSavesDirectory()}`,
              },
            ],
          };
        }

        const formatted = saves.map((s, i) => {
          const date = new Date(s.modified).toLocaleString();
          const leader = s.leader ? ` (${s.leader})` : '';
          const turn = s.turn ? ` Turn ${s.turn}` : '';
          return `${i + 1}. ${s.name}${leader}${turn}\n   Modified: ${date}\n   Path: ${s.path}`;
        }).join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${saves.length} save file(s):\n\n${formatted}`,
            },
          ],
        };
      }

      case 'read_game_state': {
        const parsed = ReadGameStateSchema.parse(args);
        const state = parseSaveFile(parsed.save_path);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(state, null, 2),
            },
          ],
        };
      }

      case 'get_strategy_brief': {
        const parsed = GetStrategyBriefSchema.parse(args);
        const state = parseSaveFile(parsed.save_path);
        let brief = generateStrategyBrief(state);

        // Append stored game context if available
        const context = gameContext.get('current');
        if (context) {
          brief += '\n\n## Player-Provided Context\n' + context;
        }

        return {
          content: [
            {
              type: 'text',
              text: brief,
            },
          ],
        };
      }

      case 'set_game_context': {
        const parsed = SetGameContextSchema.parse(args);
        gameContext.set('current', parsed.context);

        return {
          content: [
            {
              type: 'text',
              text: 'Game context saved. This information will be included in future strategy briefs.',
            },
          ],
        };
      }

      case 'get_game_context': {
        const context = gameContext.get('current');

        return {
          content: [
            {
              type: 'text',
              text: context || 'No game context has been set. Use set_game_context to add information about your current game state.',
            },
          ],
        };
      }

      case 'get_civ_statistics': {
        const parsed = GetCivStatisticsSchema.parse(args);
        const historyFile = findHistoryFile();

        if (!historyFile) {
          return {
            content: [
              {
                type: 'text',
                text: `Game history logging is not enabled or no data has been recorded yet.

To enable logging:
1. The setting GameHistoryLogLevel has been set to 1 in UserOptions.txt
2. Load your game in Civ6 and play at least one turn
3. The game will create a log file at: ${getLogsDirectory()}/GameCoreHistory1.xml

Once you've played a turn, try this command again.`,
              },
            ],
          };
        }

        const stats = parsed.turn !== undefined
          ? getStatsForTurn(parsed.turn)
          : getLatestTurnStats();

        if (!stats || stats.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No statistics found for the requested turn. The game history file exists but may not contain data yet.',
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      }

      case 'get_victory_progress': {
        const historyFile = findHistoryFile();

        if (!historyFile) {
          return {
            content: [
              {
                type: 'text',
                text: `Game history logging is not enabled. Enable it by setting GameHistoryLogLevel=1 in UserOptions.txt, then play at least one turn.`,
              },
            ],
          };
        }

        const stats = getLatestTurnStatsFullCivsOnly();
        if (!stats || stats.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No statistics available yet. Play at least one turn with logging enabled.',
              },
            ],
          };
        }

        const progress = calculateVictoryProgress(stats);
        const formatted = formatVictoryProgress(progress);

        return {
          content: [
            {
              type: 'text',
              text: formatted,
            },
          ],
        };
      }

      case 'get_yield_comparison': {
        const historyFile = findHistoryFile();

        if (!historyFile) {
          return {
            content: [
              {
                type: 'text',
                text: `Game history logging is not enabled. Enable it by setting GameHistoryLogLevel=1 in UserOptions.txt, then play at least one turn.`,
              },
            ],
          };
        }

        const stats = getLatestTurnStatsFullCivsOnly();
        if (!stats || stats.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No statistics available yet. Play at least one turn with logging enabled.',
              },
            ],
          };
        }

        const formatted = formatStatsComparison(stats);

        return {
          content: [
            {
              type: 'text',
              text: formatted,
            },
          ],
        };
      }

      // New log mining tool handlers
      case 'get_diplomatic_status': {
        const parsed = GetDiplomaticStatusSchema.parse(args);
        const relations = parseDiplomacy();

        if (relations.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No diplomatic data available. Make sure game logging is enabled and you have played at least one turn.',
              },
            ],
          };
        }

        const formatted = formatDiplomacyStatus(relations, parsed.civilization);
        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'get_diplomatic_modifiers': {
        const parsed = GetDiplomaticModifiersSchema.parse(args);
        const modifiers = parseDiplomacyModifiers();

        if (modifiers.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No diplomatic modifier data available.',
              },
            ],
          };
        }

        const formatted = formatDiplomacyModifiers(modifiers, parsed.civilization);
        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'get_military_intelligence': {
        const intel = parseMilitaryIntel();

        if (intel.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No military intelligence data available.',
              },
            ],
          };
        }

        const formatted = formatMilitaryIntelligence(intel);
        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'get_combat_log': {
        const parsed = GetCombatLogSchema.parse(args);
        const records = parseCombatLog();

        if (records.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No combat records available. The game is peaceful (for now).',
              },
            ],
          };
        }

        const formatted = formatCombatLog(records, parsed.turns);
        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'get_city_production': {
        const parsed = GetCityProductionSchema.parse(args);
        const production = parseCityProduction();

        if (production.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No city production data available.',
              },
            ],
          };
        }

        const formatted = formatCityProduction(production, parsed.civilization);
        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'get_city_status': {
        const parsed = GetCityStatusSchema.parse(args);
        const production = parseCityProduction();
        const foundingStats = parseCityFoundingStats();

        if (foundingStats.length === 0 && production.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No city data available. Make sure game logging is enabled (GameHistoryLogLevel=1 in UserOptions.txt) and you have played at least one turn.',
              },
            ],
          };
        }

        const formatted = formatCityStatus(production, foundingStats, parsed.player_id);
        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'get_tech_status': {
        const progress = parseTechStatus();

        if (progress.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No technology data available.',
              },
            ],
          };
        }

        const formatted = formatTechStatus(progress);
        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'get_world_congress': {
        const { votes, results } = parseWorldCongress();

        if (votes.length === 0 && results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No World Congress data available. Congress may not have convened yet.',
              },
            ],
          };
        }

        const formatted = formatWorldCongress(votes, results);
        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'get_great_people': {
        const events = parseGreatPeople();

        if (events.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No Great People data available.',
              },
            ],
          };
        }

        const formatted = formatGreatPeople(events);
        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'get_great_people_culture': {
        const events = parseCulturalGreatPeople();

        if (events.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No cultural Great People data available. Artists, Writers, and Musicians have not been recruited yet.',
              },
            ],
          };
        }

        const formatted = formatCulturalGreatPeople(events);
        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'get_score_breakdown': {
        const scores = parseScoreBreakdown();

        if (scores.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No score data available. Enable game logging (GameHistoryLogLevel=1 in UserOptions.txt) and play at least one turn.',
              },
            ],
          };
        }

        const formatted = formatScoreBreakdown(scores);
        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'get_strategic_overview': {
        const parsed = GetStrategicOverviewSchema.parse(args);
        const stats = getLatestTurnStatsFullCivsOnly();

        if (!stats || stats.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No game data available. Enable logging (GameHistoryLogLevel=1) and play at least one turn.',
              },
            ],
          };
        }

        const formatted = generateStrategicOverview(stats, parsed.civilization);
        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      case 'get_trend_analysis': {
        const parsed = GetTrendAnalysisSchema.parse(args);
        const trends = analyzeTrends(parsed.turns);

        if (!trends || trends.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No trend data available. Need at least 2 turns of game history. Play more turns with logging enabled.',
              },
            ],
          };
        }

        const formatted = formatTrendAnalysis(trends);
        return {
          content: [{ type: 'text', text: formatted }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Civ6 MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
