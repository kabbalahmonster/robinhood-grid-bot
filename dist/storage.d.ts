import { Position } from './types.js';
/**
 * Load positions from JSON file
 */
export declare function loadPositions(): Promise<Position[]>;
/**
 * Save positions to JSON file
 */
export declare function savePositions(positions: Position[]): Promise<void>;
/**
 * Add a new position
 */
export declare function addPosition(positions: Position[], newPosition: Position): Promise<Position[]>;
/**
 * Update an existing position
 */
export declare function updatePosition(positions: Position[], index: number, updates: Partial<Position>): Promise<Position[]>;
/**
 * Remove a position
 */
export declare function removePosition(positions: Position[], index: number): Promise<{
    updated: Position[];
    removed: Position;
}>;
/**
 * Get position by token address
 */
export declare function getPositionByToken(positions: Position[], tokenAddress: string): {
    position: Position | null;
    index: number;
};
/**
 * Check if a token has a position
 */
export declare function hasPosition(positions: Position[], tokenAddress: string): boolean;
//# sourceMappingURL=storage.d.ts.map