# Security Review Report

**Project**: civ6mcp (Civilization VI MCP Server)
**Date**: 2026-01-18
**Reviewer**: Claude Security Review

## Executive Summary

This security review analyzed the civ6mcp MCP server, a TypeScript/Node.js application that provides Claude with access to Civilization VI game data through 23 tools. The codebase is generally well-structured, but contains several security concerns that should be addressed.

**Risk Level**: Medium
**Critical Issues**: 0
**High Issues**: 1
**Medium Issues**: 2
**Low Issues**: 5

---

## Findings

### HIGH-1: Path Traversal Vulnerability in File Operations

**Location**: `src/index.ts:74-79`, `src/parser.ts:325`
**Severity**: High
**CVSS Score Estimate**: 6.5 (Medium-High)

**Description**:
The `read_game_state` and `get_strategy_brief` tools accept a user-provided `save_path` parameter that is passed directly to `readFileSync()` without any path validation. This allows reading arbitrary files on the system.

**Vulnerable Code**:
```typescript
// src/index.ts:73-75
const ReadGameStateSchema = z.object({
  save_path: z.string().describe('Full path to the .Civ6Save file'),
});

// src/parser.ts:325
export function parseSaveFile(filePath: string): GameState {
  const buffer = readFileSync(filePath);  // No path validation
  // ...
}
```

**Attack Scenario**:
A user could invoke the tool with:
- `save_path: "/etc/passwd"` - Read system files
- `save_path: "/home/user/.ssh/id_rsa"` - Read SSH keys
- `save_path: "../../../../etc/shadow"` - Path traversal

While the "CIV6" magic bytes check (line 329) will cause an error for non-save files, this still:
1. Confirms file existence
2. May leak partial file contents in error messages
3. Can read first 150KB of any file (header section extraction)

**Recommendation**:
```typescript
import { resolve, dirname } from 'path';

function validateSavePath(filePath: string): string {
  const savesDir = getSavesDirectory();
  const resolved = resolve(filePath);

  // Ensure path is within saves directory
  if (!resolved.startsWith(savesDir)) {
    throw new Error('Invalid save path: must be within Civ6 saves directory');
  }

  // Ensure file has correct extension
  if (!resolved.endsWith('.Civ6Save')) {
    throw new Error('Invalid save path: must be a .Civ6Save file');
  }

  return resolved;
}
```

---

### MEDIUM-1: Decompression Bomb (Zip Bomb) Vulnerability

**Location**: `src/parser.ts:122-147`
**Severity**: Medium
**CVSS Score Estimate**: 5.3

**Description**:
The `decompressGameData()` function decompresses zlib data without size limits. A maliciously crafted file could decompress to an extremely large size, causing memory exhaustion and denial of service.

**Vulnerable Code**:
```typescript
function decompressGameData(buffer: Buffer): Buffer | null {
  // ... finds and assembles compressed data ...
  try {
    return unzipSync(assembledData, { finishFlush: constants.Z_SYNC_FLUSH });
  } catch {
    return null;
  }
}
```

**Recommendation**:
```typescript
const MAX_DECOMPRESSED_SIZE = 100 * 1024 * 1024; // 100MB limit

function decompressGameData(buffer: Buffer): Buffer | null {
  // ... existing code ...
  try {
    const decompressed = unzipSync(assembledData, {
      finishFlush: constants.Z_SYNC_FLUSH,
      maxOutputLength: MAX_DECOMPRESSED_SIZE
    });
    return decompressed;
  } catch (e) {
    if (e.code === 'ERR_BUFFER_TOO_LARGE') {
      throw new Error('Save file decompressed data exceeds size limit');
    }
    return null;
  }
}
```

---

### MEDIUM-2: Synchronous File I/O Enables Denial of Service

**Location**: Throughout `src/parser.ts`, `src/logs-parser.ts`, `src/history-parser.ts`
**Severity**: Medium
**CVSS Score Estimate**: 4.3

**Description**:
All file operations use synchronous methods (`readFileSync`, `readdirSync`, `statSync`). This blocks the Node.js event loop and could cause the server to become unresponsive when:
- Processing very large files
- Accessing files on slow storage (network shares, mounted drives)
- Processing many requests concurrently

**Recommendation**:
Consider using asynchronous file operations with `fs/promises` for better resilience:

```typescript
import { readFile, readdir, stat } from 'fs/promises';

export async function parseSaveFile(filePath: string): Promise<GameState> {
  const buffer = await readFile(filePath);
  // ...
}
```

---

### LOW-1: Information Disclosure via Error Messages

**Location**: `src/index.ts:873-884`
**Severity**: Low

**Description**:
Error messages are passed directly to clients without sanitization, potentially revealing internal paths, file system structure, or other sensitive information.

**Vulnerable Code**:
```typescript
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}
```

**Recommendation**:
```typescript
function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Remove file paths from error messages
    return error.message.replace(/\/[^\s]+/g, '[path redacted]');
  }
  return 'An unexpected error occurred';
}
```

---

### LOW-2: Missing Input Validation for Numeric Parameters

**Location**: `src/index.ts:88-89`, `src/index.ts:107-108`, `src/index.ts:115-116`, `src/index.ts:133-134`
**Severity**: Low

**Description**:
Numeric parameters like `turn`, `turns`, and `player_id` have no range validation. While unlikely to cause security issues, extremely large values could cause unexpected behavior.

**Current Code**:
```typescript
const GetCivStatisticsSchema = z.object({
  turn: z.number().optional(),
});
```

**Recommendation**:
```typescript
const GetCivStatisticsSchema = z.object({
  turn: z.number().int().min(0).max(2000).optional(),
});
```

---

### LOW-3: No Rate Limiting

**Location**: N/A (missing feature)
**Severity**: Low

**Description**:
The MCP server has no rate limiting mechanism. A malicious client could flood the server with tool calls, causing resource exhaustion.

**Recommendation**:
Consider implementing request throttling at the MCP server level or documenting this as a deployment consideration.

---

### LOW-4: Potential Regex Denial of Service (ReDoS)

**Location**: Multiple locations with regex patterns
**Severity**: Low

**Description**:
Several regex patterns are applied to potentially large input strings. While the patterns appear relatively simple, complex input could cause performance degradation.

**Examples**:
- `src/parser.ts:174`: `/CIVILIZATION_([A-Z_]+?)(?=[^A-Z_]|$)/g`
- `src/parser.ts:397`: UUID pattern matching

**Recommendation**:
Consider adding input length limits before applying regex operations.

---

### LOW-5: Directory Traversal in Save File Scanning

**Location**: `src/parser.ts:31-32`
**Severity**: Low

**Description**:
The `scanDir` function has a depth limit of 2, but doesn't validate that subdirectories are within expected locations. While the base path is fixed, symlinks could potentially lead outside the saves directory.

**Vulnerable Code**:
```typescript
const scanDir = (dir: string, depth = 0) => {
  if (depth > 2) return; // Depth limit, but no symlink check
  // ...
}
```

**Recommendation**:
Use `fs.realpathSync()` to resolve symlinks and verify the resolved path is still within the saves directory.

---

## Positive Security Findings

The following security practices were observed and commended:

1. **Input Schema Validation**: Uses Zod for tool input validation
2. **No Hardcoded Secrets**: No credentials, API keys, or secrets in the codebase
3. **No Command Execution**: No shell commands or `child_process` usage
4. **No Network Requests**: The server only reads local files; no external API calls
5. **TypeScript with Strict Mode**: Provides compile-time type safety
6. **Modern Dependencies**: Well-maintained packages with no known critical CVEs
7. **Read-Only Operations**: The server only reads data; no file modifications
8. **Clear Separation of Concerns**: Modular code structure aids security review

---

## Dependency Analysis

| Package | Version | Purpose | Known CVEs |
|---------|---------|---------|------------|
| @modelcontextprotocol/sdk | ^1.25.1 | MCP protocol | None known |
| civ6-save-parser | ^1.2.3 | Binary save parsing | None known |
| fast-xml-parser | ^5.3.3 | XML parsing | None known |
| pako | ^2.1.0 | Zlib compression | None known |
| zod | ^4.2.1 | Schema validation | None known |

**Recommendation**: Run `npm audit` regularly and keep dependencies updated.

---

## Remediation Priority

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 | HIGH-1: Path Traversal | Medium |
| 2 | MEDIUM-1: Decompression Bomb | Low |
| 3 | MEDIUM-2: Sync I/O DoS | High |
| 4 | LOW-1: Error Info Disclosure | Low |
| 5 | LOW-2: Numeric Validation | Low |

---

## Conclusion

The civ6mcp server is a relatively low-risk application with a narrow scope (reading local game files). The most significant issue is the path traversal vulnerability in the `save_path` parameter, which should be addressed before production use. The decompression bomb vulnerability is a secondary concern.

The application benefits from operating in a trusted context (local MCP server for Claude Desktop) and performing read-only operations. However, the identified issues should still be remediated following the principle of defense in depth.
