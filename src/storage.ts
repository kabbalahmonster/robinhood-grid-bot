import fs from 'fs/promises';
import path from 'path';
import { Position, PositionsData } from './types.js';
import { logger } from './logger.js';

// Get project root directory
const PROJECT_ROOT = process.cwd();
const POSITIONS_FILE = path.join(PROJECT_ROOT, 'positions.json');
const DATA_VERSION = '1.0.0';

/**
 * Load positions from JSON file
 */
export async function loadPositions(): Promise<Position[]> {
  try {
    const data = await fs.readFile(POSITIONS_FILE, 'utf-8');
    const parsed: PositionsData = JSON.parse(data);
    
    // Validate data structure
    if (!parsed.positions || !Array.isArray(parsed.positions)) {
      logger.warn('Invalid positions file format, starting fresh');
      return [];
    }

    logger.info(`Loaded ${parsed.positions.length} positions from storage`);
    return parsed.positions;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.info('No positions file found, starting fresh');
      return [];
    }
    logger.error('Error loading positions:', error);
    throw error;
  }
}

/**
 * Save positions to JSON file
 */
export async function savePositions(positions: Position[]): Promise<void> {
  const data: PositionsData = {
    positions,
    lastUpdated: Date.now(),
    version: DATA_VERSION,
  };

  try {
    await fs.writeFile(
      POSITIONS_FILE,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
    logger.debug(`Saved ${positions.length} positions to storage`);
  } catch (error) {
    logger.error('Error saving positions:', error);
    throw error;
  }
}

/**
 * Add a new position
 */
export async function addPosition(
  positions: Position[],
  newPosition: Position
): Promise<Position[]> {
  const updated = [...positions, newPosition];
  await savePositions(updated);
  logger.info(`Added position for ${newPosition.symbol}`, {
    symbol: newPosition.symbol,
    balance: newPosition.balance,
    cost: newPosition.cost,
  });
  return updated;
}

/**
 * Update an existing position
 */
export async function updatePosition(
  positions: Position[],
  index: number,
  updates: Partial<Position>
): Promise<Position[]> {
  if (index < 0 || index >= positions.length) {
    throw new Error(`Invalid position index: ${index}`);
  }

  const updated = [...positions];
  updated[index] = { ...updated[index], ...updates };
  await savePositions(updated);
  logger.info(`Updated position ${index} for ${updated[index].symbol}`);
  return updated;
}

/**
 * Remove a position
 */
export async function removePosition(
  positions: Position[],
  index: number
): Promise<{ updated: Position[]; removed: Position }> {
  if (index < 0 || index >= positions.length) {
    throw new Error(`Invalid position index: ${index}`);
  }

  const removed = positions[index];
  const updated = positions.filter((_, i) => i !== index);
  await savePositions(updated);
  logger.info(`Removed position for ${removed.symbol}`, {
    symbol: removed.symbol,
    balance: removed.balance,
    cost: removed.cost,
  });
  return { updated, removed };
}

/**
 * Get position by token address
 */
export function getPositionByToken(
  positions: Position[],
  tokenAddress: string
): { position: Position | null; index: number } {
  const index = positions.findIndex(
    (p) => p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
  );
  return {
    position: index >= 0 ? positions[index] : null,
    index,
  };
}

/**
 * Check if a token has a position
 */
export function hasPosition(
  positions: Position[],
  tokenAddress: string
): boolean {
  return positions.some(
    (p) => p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
  );
}
