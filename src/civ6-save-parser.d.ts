declare module 'civ6-save-parser' {
  interface ParsedCiv {
    SLOT_HEADER?: { marker: Buffer; type: number; data: number; chunk: Buffer };
    PLAYER_ALIVE?: { marker: Buffer; type: number; data: boolean; chunk: Buffer };
    PLAYER_PASSWORD?: { marker: Buffer; type: number; data: string; chunk: Buffer };
    IS_CURRENT_TURN?: { marker: Buffer; type: number; data: boolean; chunk: Buffer };
    ACTOR_NAME?: { marker: Buffer; type: number; data: string; chunk: Buffer };
    ACTOR_TYPE?: { marker: Buffer; type: number; data: string; chunk: Buffer };
    ACTOR_AI_HUMAN?: { marker: Buffer; type: number; data: number; chunk: Buffer };
    LEADER_NAME?: { marker: Buffer; type: number; data: string; chunk: Buffer };
    START_ACTOR?: { marker: Buffer; type: number; data: number; chunk: Buffer };
  }

  interface ParsedMod {
    MOD_ID?: { marker: Buffer; type: number; data: string; chunk: Buffer };
    MOD_TITLE?: { marker: Buffer; type: number; data: string; chunk: Buffer };
  }

  interface ParsedData {
    GAME_TURN?: { marker: Buffer; type: number; data: number; chunk: Buffer };
    GAME_SPEED?: { marker: Buffer; type: number; data: string; chunk: Buffer };
    MAP_SIZE?: { marker: Buffer; type: number; data: string; chunk: Buffer };
    MAP_FILE?: { marker: Buffer; type: number; data: string; chunk: Buffer };
    MAP_FILE_2?: { marker: Buffer; type: number; data: string; chunk: Buffer };
    CIVS: ParsedCiv[];
    ACTORS: ParsedCiv[];
    MOD_BLOCK_1?: ParsedMod[];
    MOD_BLOCK_2?: ParsedMod[];
    MOD_BLOCK_3?: ParsedMod[];
    MOD_BLOCK_4?: ParsedMod[];
    MOD_BLOCK_2_2?: ParsedMod[];
    MOD_BLOCK_3_2?: ParsedMod[];
  }

  interface ParseResult {
    parsed: ParsedData;
    chunks: Buffer[];
    compressed: Buffer | null;
  }

  export function parse(buffer: Buffer): ParseResult;
}
