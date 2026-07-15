import { Position } from './types.js';
/**
 * Grid Trading Bot for Robinhood Chain
 */
export declare class GridBot {
    private positions;
    private account;
    private running;
    private checkInterval;
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
     */
    private checkAllPositions;
    /**
     * Check a single position for sell conditions
     */
    private checkPositionForSell;
    /**
     * Execute stop loss sell
     */
    private executeStopLoss;
    /**
     * Execute profit-taking sell with optional moonbag
     */
    private executeSell;
    /**
     * Check for new buy opportunities
     */
    private checkForBuyOpportunities;
    /**
     * Execute a buy order
     */
    private executeBuy;
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
    getPositions(): Position[];
    /**
     * Check if bot is running
     */
    isRunning(): boolean;
}
//# sourceMappingURL=bot.d.ts.map