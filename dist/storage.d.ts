import { Position } from './types.js';
/**
 * Load positions from JSON file
 * Returns a Record of positions keyed by their ID
 */
export declare function loadPositions(): Promise<Record<string, Position>>;
/**
 * Save positions to JSON file
 * Accepts a Record of positions keyed by their ID
 */
export declare function savePositions(positions: Record<string, Position>): Promise<void>;
/**
 * Add or update a position
 */
export declare function savePosition(positions: Record<string, Position>, position: Position): Promise<Record<string, Position>>;
/**
 * Update an existing position by ID
 */
export declare function updatePosition(positions: Record<string, Position>, id: string, updates: Partial<Position>): Promise<Record<string, Position>>;
/**
 * Remove a position by ID
 */
export declare function removePosition(positions: Record<string, Position>, id: string): Promise<{
    updated: Record<string, Position>;
    removed: Position;
}>;
/**
 * Get position by ID
 */
export declare function getPositionById(positions: Record<string, Position>, id: string): Position | null;
/**
 * Get all positions as an array
 */
export declare function getPositionsArray(positions: Record<string, Position>): Position[];
/**
 * Get all empty positions (balance === 0)
 */
export declare function getEmptyPositions(positions: Record<string, Position>): Position[];
/**
 * Get all filled positions (balance > 0)
 */
export declare function getFilledPositions(positions: Record<string, Position>): Position[];
/**
 * Check if a position exists
 */
export declare function hasPosition(positions: Record<string, Position>, id: string): boolean;
/**
 * Generate grid positions dynamically
 * Uses GRID_SPACING_PERCENT from config to calculate levels
 */
export declare function generateGridPositions(basePrice: number, gridSizeUsd: number, gridSpacingPercent: number, numGrids: number, tokenAddress?: string, symbol?: string): Record<string, Position>;
/**
 * Initialize positions from file or generate if empty
 */
export declare function initializePositions(generateIfEmpty: boolean, basePrice?: number, gridSizeUsd?: number, gridSpacingPercent?: number, numGrids?: number, tokenAddress?: string, symbol?: string): Promise<Record<string, Position>>;
//# sourceMappingURL=storage.d.ts.map