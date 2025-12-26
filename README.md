# Civilization VI MCP Server

An MCP (Model Context Protocol) server that provides Claude with real-time access to your Civilization VI game data. Get strategic analysis, diplomatic intelligence, military assessments, and more by connecting Claude to your active game.

## Features

- **Strategic Overview** - Comprehensive situational briefing combining all intelligence
- **Diplomatic Intelligence** - Track relationships, alliances, and the reasons behind them
- **Military Analysis** - Monitor troop strength, combat desire, and threat levels
- **Production Tracking** - See what every civilization is building
- **Victory Progress** - Track who's leading each victory type
- **Trend Analysis** - Identify rising powers and declining civilizations
- **Combat History** - Review recent battles and ongoing conflicts
- **World Congress** - Track voting records and resolutions
- **Great People** - Monitor the great people race

## Requirements

- Node.js 18+
- Civilization VI (macOS or Windows)
- Claude Desktop

> **Important**: You must enable game logging in Civilization VI for the MCP server to access game data. See [Enable Game Logging](#enable-game-logging) below.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/lowrykun/civ6mcp.git
   cd civ6mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Enable Game Logging

The MCP server reads data from Civilization VI's log files. You need to enable logging:

1. Find your `UserOptions.txt` file:
   - **macOS**: `~/Library/Application Support/Sid Meier's Civilization VI/UserOptions.txt`
   - **Windows**: `~/Documents/My Games/Sid Meier's Civilization VI/UserOptions.txt`

2. Add or modify this line:
   ```
   GameHistoryLogLevel=1
   ```

3. Start Civilization VI and play at least one turn to generate log data.

## Claude Desktop Configuration

Add this to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "civ6": {
      "command": "node",
      "args": ["/path/to/civ6mcp/dist/index.js"]
    }
  }
}
```

Replace `/path/to/civ6mcp` with the actual path to where you cloned the repository.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_strategic_overview` | Comprehensive briefing: threats, opportunities, victory race |
| `get_yield_comparison` | Compare all civs' science, culture, gold, faith, military |
| `get_victory_progress` | Who's leading each victory type |
| `get_civ_statistics` | Detailed per-civ stats (specify turn number optional) |
| `get_trend_analysis` | Track changes over time, identify rising/declining powers |
| `get_diplomatic_status` | Relationships: allied, friendly, denounced, war |
| `get_diplomatic_modifiers` | Specific reasons for +/- relations |
| `get_military_intelligence` | Strength, combat desire, threat levels |
| `get_combat_log` | Recent battles, units, damage |
| `get_city_production` | What every city is building |
| `get_tech_status` | Technology progress by civilization |
| `get_world_congress` | Voting records and resolution outcomes |
| `get_great_people` | Great People claimed and available |
| `list_saves` | Find save files |
| `read_game_state` | Parse save file for basic game info |
| `get_strategy_brief` | Formatted briefing from save file |

See [TOOLS.md](TOOLS.md) for detailed documentation.

## Usage Examples

Ask Claude things like:
- "What's my current strategic situation?"
- "Who is the biggest threat right now?"
- "What are my neighbors building?"
- "How are my yields compared to other civs?"
- "Show me the trend analysis for the last 10 turns"
- "What's the diplomatic situation with Persia?"

## How It Works

The MCP server reads from two sources:

1. **Save Files** (`.Civ6Save`) - Basic game info like leader, turn, map settings
2. **Log Files** (CSV) - Detailed statistics generated each turn when logging is enabled

Log files provide much richer data including:
- All civilizations' yields and military strength
- Diplomatic relationships and their modifiers
- Combat records
- City production queues
- Technology progress
- World Congress votes

## Platform Support

- **macOS** - Fully supported
- **Windows** - Fully supported

## Troubleshooting

**"No game data available"**
- Make sure `GameHistoryLogLevel=1` is set in UserOptions.txt
- Play at least one turn after enabling logging
- Check that log files exist in your Logs directory

**Data seems outdated**
- Log files update when you complete a turn
- Mid-turn, you'll only see your own civilization's latest data

## License

MIT License - see [LICENSE](LICENSE) for details.
