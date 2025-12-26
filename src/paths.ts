import { homedir, platform } from 'os';
import { join } from 'path';

/**
 * Get the Civilization VI saves directory for the current platform.
 */
export function getSavesDirectory(): string {
  if (platform() === 'win32') {
    return join(homedir(), 'Documents/My Games/Sid Meier\'s Civilization VI/Saves');
  }
  // macOS
  return join(homedir(), "Library/Application Support/Sid Meier's Civilization VI/Sid Meier's Civilization VI/Saves");
}

/**
 * Get the Civilization VI logs directory for the current platform.
 */
export function getLogsDirectory(): string {
  if (platform() === 'win32') {
    return join(homedir(), 'Documents/My Games/Sid Meier\'s Civilization VI/Logs');
  }
  // macOS
  return join(homedir(), "Library/Application Support/Sid Meier's Civilization VI/Firaxis Games/Sid Meier's Civilization VI/Logs");
}

/**
 * Get the UserOptions.txt path for the current platform (for documentation purposes).
 */
export function getUserOptionsPath(): string {
  if (platform() === 'win32') {
    return join(homedir(), 'Documents/My Games/Sid Meier\'s Civilization VI/UserOptions.txt');
  }
  // macOS
  return join(homedir(), "Library/Application Support/Sid Meier's Civilization VI/UserOptions.txt");
}
