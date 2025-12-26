# Civilization VI MCP Server Tools

This MCP server provides tools to analyze your Civilization VI game state by parsing save files and game logs. Use these tools to get strategic intelligence and advice.

## Setup Requirements

Enable game logging by setting `GameHistoryLogLevel=1` in your `UserOptions.txt` file, then play at least one turn to generate log data.

---

## Core Game State Tools

### `list_saves`
List all Civilization VI save files (autosaves, manual saves, quicksaves).

**Parameters:**
- `filter` (optional): `"all"` | `"autosave"` | `"manual"` | `"quicksave"`

---

### `read_game_state`
Parse a save file to get basic game information: leader, civilization, turn, era, difficulty, map settings, and other players.

**Parameters:**
- `save_path` (required): Full path to the `.Civ6Save` file

---

### `get_strategy_brief`
Get a formatted strategy briefing from a save file, suitable for discussing strategy and next moves.

**Parameters:**
- `save_path` (required): Full path to the `.Civ6Save` file

---

### `set_game_context` / `get_game_context`
Store and retrieve additional game context that can't be parsed from files (e.g., current goals, specific strategies).

---

## Statistics & Victory Tools

### `get_civ_statistics`
Get detailed statistics for ALL civilizations: yields, military, cities, score, techs, civics, territory.

**Parameters:**
- `turn` (optional): Specific turn number. Defaults to latest turn.

---

### `get_yield_comparison`
Get a comparison table of all civilizations' yields (science, culture, gold, faith per turn), cities, and military strength.

---

### `get_victory_progress`
Get victory progress positions for all civilizations across Science, Culture, Domination, and Score victories.

---

## Diplomacy Tools

### `get_diplomatic_status`
Get diplomatic relationships between all civilizations: alliances, friendships, denouncements, wars, and threat levels.

**Parameters:**
- `civilization` (optional): Filter to show relations for a specific civilization

**Output includes:**
- Relationship status (ALLIED, FRIENDLY, UNFRIENDLY, DENOUNCED, WAR)
- Diplomatic scores
- Threat/trust levels
- Active wars

---

### `get_diplomatic_modifiers`
Get specific diplomatic modifiers explaining WHY civilizations like or dislike each other.

**Parameters:**
- `civilization` (optional): Filter to show modifiers for a specific civilization

**Example modifiers:**
- "Allied with a friend" (+8)
- "Denounced them" (-9)
- "Grievances from other players" (-12)
- "Long peace" (+8)

---

## Military Intelligence Tools

### `get_military_intelligence`
Get military strength, combat desire (aggressiveness), and strategic intentions for all civilizations.

**Output includes:**
- Regional military strength
- Combat desire score (0-20, higher = more aggressive)
- Preferred military tech targets
- Civs under military pressure

---

### `get_combat_log`
Get recent combat history showing battles, units involved, and damage.

**Parameters:**
- `turns` (optional): Number of recent turns to show (default: 5)

**Output includes:**
- Attacker/defender civilizations and units
- Damage dealt and received
- Active conflicts summary

---

## Production & Technology Tools

### `get_city_production`
Get what every city is currently building, with special highlighting for strategic items.

**Parameters:**
- `civilization` (optional): Filter to specific civilization

**Highlights:**
- Giant Death Robots
- Manhattan Project / Nuclear weapons
- Space race projects (Moon Landing, Exoplanet Expedition)
- Military units

---

### `get_tech_status`
Get technology research progress for all civilizations.

**Output includes:**
- Total techs researched per civilization
- Tech leader identification

---

## World Events Tools

### `get_world_congress`
Get World Congress voting records and resolution outcomes.

**Output includes:**
- Recent resolutions and outcomes
- How each civilization voted
- Vote counts

---

### `get_great_people`
Get Great People that have been claimed and those available for recruitment.

**Output includes:**
- Recently claimed Great People and recipients
- Available Great People in timeline
- Cost to recruit

---

## Strategic Analysis

### `get_strategic_overview`
**The most comprehensive tool** - Get a combined strategic briefing synthesizing all available intelligence.

**Parameters:**
- `civilization` (optional): Your civilization name for personalized analysis

**Output includes:**

1. **Immediate Threats**
   - Military threats (high combat desire, strong armies)
   - Dangerous production (Giant Death Robots, nukes)
   - Hostile diplomatic stances

2. **Diplomatic Opportunities**
   - Allied and friendly civilizations
   - Suggestions for alliance upgrades or joint wars

3. **Active Conflicts**
   - Who is fighting whom
   - Battle counts

4. **Victory Race**
   - Leader in each victory type
   - Your position in each category

5. **Key Production to Watch**
   - Strategic items being built by other civs
   - Completion estimates

---

### `get_trend_analysis`
Analyze trends over multiple turns showing how each civilization's yields, military, and territory are changing.

**Parameters:**
- `turns` (optional): Number of turns to analyze (default: 10)

**Output includes:**
- Score trends (who's growing fastest)
- Science trends (acceleration/deceleration)
- Culture trends
- Military trends (with buildup warnings)
- Expansion trends (cities, territory)
- Key insights (military buildups, declining civs)

---

## Recommended Usage

For a quick game assessment, use:
1. `get_strategic_overview` - Comprehensive situational awareness
2. `get_yield_comparison` - Detailed economic comparison
3. `get_trend_analysis` - See who's rising or falling

For specific analysis:
- Before war: `get_military_intelligence` + `get_diplomatic_status`
- Tracking rivals: `get_city_production` + `get_tech_status`
- Long-term threats: `get_trend_analysis` (watch for military buildups)
- Diplomacy planning: `get_diplomatic_modifiers`
