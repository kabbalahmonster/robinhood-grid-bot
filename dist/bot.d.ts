import { Position } from './types.js';
/**
 * Grid Trading Bot for Robinhood Chain
 * Supports pre-generated grid positions loaded from JSON
 * Supports auto-generated grid positions at startup
 * Supports dynamic on-demand positions (DCA on drops)
 */
export declare class GridBot {
    private positions;
    private account;
    private running;
    private checkInterval;
    private lastBuyPrice;
    private positionsCreated;
    /**
     * Initialize the bot
     */
    initialize(): Promise<void>;
    /**
     * Start the bot
     */
    start(): Promise<void>;
    /**
     * Stop the bot
     */
    stop(): Promise<void>;
    /**
     * Check all positions and execute trades as needed
     * New behavior: Check ALL empty positions for buy opportunities
     * Check ALL filled positions for sell/stoploss conditions
     * Dynamic mode: Create positions on-demand when price drops
     */
    private checkAllPositions;
    /**
     * Check a single position for buy conditions
     * Buy logic: If position is empty (balance=0) and current price is within buyMin-buyMax range
     */
    private checkPositionForBuy;
    /**
     * Dynamic mode: Check for buy opportunities based on price drops
     * Creates new positions on-demand when price drops by GRID_SPACING_PERCENT
     */
    private checkDynamicBuyOpportunity;
    /**
     * Dynamic mode: Create a new position and execute buy
     */
    private createAndBuyPosition;
    /**
     * Check a single position for sell conditions
     * Sell logic: If position has balance and current price hits sellMin or stoploss
     */
    private checkPositionForSell;
    /**
     * Execute buy into a specific position
     */
    private executeBuy;
    /**
     * Execute stop loss sell for a specific position
     * Validates quote output is reasonable before executing (no extreme slippage)
     */
    private executeStopLoss;
    /**
     * Execute profit-taking sell for a specific position
     * STRICT PROFIT CHECK: Verifies quote output meets profit threshold before executing
     */
    private executeSell;
    /**
     * Swap USDG to token
     */
    private swapUsdToToken;
    /**
     * Swap token to USDG
     */
    private swapTokenToUsd;
    /**
     * Get current positions
     */
    getPositions(): Record<string, Position>;
    /**
     * Get positions as array
     */
    getPositionsArray(): Position[];
    /**
     * Check if bot is running
     */
    isRunning(): boolean;
    /**
     * Generate and save grid positions
     * Useful for initial setup
     */
    generateGridPositions(basePrice: number, numGrids: number, tokenAddress?: string, symbol?: string): Promise<void>;
}
//# sourceMappingURL=bot.d.ts.map