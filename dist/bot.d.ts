import { Position } from './types.js';
/**
 * Grid Trading Bot for Robinhood Chain
 *
 * ARCHITECTURE (like Python bot):
 * - Quote Currency: WETH (like SOL in Python bot)
 * - Trading Token: Configured ERC20 (e.g., PONS, COMPUTE)
 * - Bank Currency: USDG
 *
 * Buy: WETH → TRADING_TOKEN
 * Sell: TRADING_TOKEN → WETH (→ USDG if banking)
 */
export declare class GridBot {
    private positions;
    private account;
    private running;
    private checkInterval;
    private lastBuyPrice;
    private positionsCreated;
    initialize(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    private checkAllPositions;
    private checkBuy;
    private checkSell;
    private checkDynamicBuy;
    private createAndBuy;
    private executeBuy;
    private executeSell;
    getPositions(): Record<string, Position>;
    isRunning(): boolean;
}
//# sourceMappingURL=bot.d.ts.map