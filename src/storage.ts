import fs from 'fs/promises';
import path from 'path';
import { Position, PositionsData } from './types.js';
import { logger } from './logger.js';

// Get project root directory
const PROJECT_ROOT = process.cwd();
const POSITIONS_FILE = path.join(PROJECT_ROOT, 'positions.json');
const DATA_VERSION = '2.0.0';

/**
 * Load positions from JSON file
 * Returns a Record of positions keyed by their ID
 */
export async function loadPositions(): Promise<Record<string, Position>> {
  try {
    const data = await fs.readFile(POSITIONS_FILE, 'utf-8');
    const parsed: PositionsData = JSON.parse(data);

    // Validate data structure
    if (!parsed.positions || typeof parsed.positions !== 'object') {
      logger.warn('Invalid positions file format, starting fresh');
      return {};
    }

    const positionCount = Object.keys(parsed.positions).length;
    logger.info(`Loaded ${positionCount} positions from storage`);
    return parsed.positions;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.info('No positions file found, starting fresh');
      return {};
    }
    logger.error('Error loading positions:', error);
    throw error;
  }
}

/**
 * Save positions to JSON file
 * Accepts a Record of positions keyed by their ID
 */
export async function savePositions(positions: Record<string, Position>): Promise<void> {
  const data: PositionsData = {
    positions,
    lastUpdated: Date.now(),
    version: DATA_VERSION,
  };

  try {
    await fs.writeFile(POSITIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    logger.debug(`Saved ${Object.keys(positions).length} positions to storage`);
  } catch (error) {
    logger.error('Error saving positions:', error);
    throw error;
  }
}

/**
 * Add or update a position
 */
export async function savePosition(
  positions: Record<string, Position>,
  position: Position
): Promise<Record<string, Position>> {
  const updated = { ...positions, [position.id]: position };
  await savePositions(updated);
  logger.info(`Saved position ${position.id}`, {
    id: position.id,
    balance: position.balance,
    cost: position.cost,
    buyMin: position.buyMin,
    buyMax: position.buyMax,
    sellMin: position.sellMin,
    stoploss: position.stoploss,
  });
  return updated;
}

/**
 * Update an existing position by ID
 */
export async function updatePosition(
  positions: Record<string, Position>,
  id: string,
  updates: Partial<Position>
): Promise<Record<string, Position>> {
  if (!positions[id]) {
    throw new Error(`Position not found: ${id}`);
  }

  const updated = {
    ...positions,
    [id]: { ...positions[id], ...updates },
  };
  await savePositions(updated);
  logger.info(`Updated position ${id}`);
  return updated;
}

/**
 * Remove a position by ID
 */
export async function removePosition(
  positions: Record<string, Position>,
  id: string
): Promise<{ updated: Record<string, Position>; removed: Position }> {
  if (!positions[id]) {
    throw new Error(`Position not found: ${id}`);
  }

  const removed = positions[id];
  const { [id]: _, ...rest } = positions;
  await savePositions(rest);
  logger.info(`Removed position ${id}`, {
    id: removed.id,
    balance: removed.balance,
    cost: removed.cost,
  });
  return { updated: rest, removed };
}

/**
 * Get position by ID
 */
export function getPositionById(
  positions: Record<string, Position>,
  id: string
): Position | null {
  return positions[id] || null;
}

/**
 * Get all positions as an array
 */
export function getPositionsArray(positions: Record<string, Position>): Position[] {
  return Object.values(positions);
}

/**
 * Get all empty positions (balance === 0)
 */
export function getEmptyPositions(positions: Record<string, Position>): Position[] {
  return Object.values(positions).filter((p) => p.balance === 0);
}

/**
 * Get all filled positions (balance > 0)
 */
export function getFilledPositions(positions: Record<string, Position>): Position[] {
  return Object.values(positions).filter((p) => p.balance > 0);
}

/**
 * Check if a position exists
 */
export function hasPosition(positions: Record<string, Position>, id: string): boolean {
  return id in positions;
}

/**
 * Generate grid positions dynamically
 * Uses GRID_SPACING_PERCENT from config to calculate levels
 */
export function generateGridPositions(
  basePrice: number,
  gridSizeUsd: number,
  gridSpacingPercent: number,
  numGrids: number,
  tokenAddress?: string,
  symbol?: string
): Record<string, Position> {
  const positions: Record<string, Position> = {};
  const spacingFactor = gridSpacingPercent / 100;

  for (let i = 0; i < numGrids; i++) {
    // Calculate grid level (each level is spaced by gridSpacingPercent)
    // Level 0 is the lowest, level numGrids-1 is the highest
    const level = i;
    const buyMin = basePrice * Math.pow(1 + spacingFactor, level);
    const buyMax = basePrice * Math.pow(1 + spacingFactor, level + 1);
    const sellMin = buyMax * (1 + spacingFactor); // Sell at next level up
    const stoploss = buyMin * (1 - spacingFactor); // Stoploss below buyMin

    const id = (i + 1).toString();
    positions[id] = {
      id,
      balance: 0,
      cost: 0,
      buyMin: Math.round(buyMin),
      buyMax: Math.round(buyMax),
      sellMin: Math.round(sellMin),
      stoploss: Math.round(stoploss),
      tokenAddress,
      symbol,
      createdAt: Date.now(),
    };
  }

  logger.info(`Generated ${numGrids} grid positions`, {
    basePrice,
    gridSpacingPercent,
    firstGrid: positions['1'],
    lastGrid: positions[numGrids.toString()],
  });

  return positions;
}

/**
 * Initialize positions from file or generate if empty
 */
export async function initializePositions(
  generateIfEmpty: boolean,
  basePrice?: number,
  gridSizeUsd?: number,
  gridSpacingPercent?: number,
  numGrids?: number,
  tokenAddress?: string,
  symbol?: string
): Promise<Record<string, Position>> {
  let positions = await loadPositions();

  // If no positions and generation is enabled, create them
  if (Object.keys(positions).length === 0 && generateIfEmpty && basePrice && gridSpacingPercent && numGrids) {
    positions = generateGridPositions(
      basePrice,
      gridSizeUsd || 100,
      gridSpacingPercent,
      numGrids,
      tokenAddress,
      symbol
    );
    await savePositions(positions);
  }

  return positions;
}
