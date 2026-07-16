import { BotConfig, WalletConfig, TokenConfig } from './types.js';
/**
 * Bot configuration from environment variables
 *
 * ROBINHOOD CHAIN OPTIMIZED DEFAULTS:
 * - GAS_RESERVE_ETH: 0.001 (was 0.01) - L2 gas is cheap on Robinhood Chain
 * - BANK_MIN_AMOUNT: 1.0 (was 0.5) - $1 minimum for cleaner accounting
 * - CHECK_INTERVAL_MS: 10000 (was 30000) - 10 second checks for faster response
 * - GRID_SIZE_USD: 10 (was 100) - Start small, scale up as you gain confidence
 * - MAX_POSITIONS: 20 (was 10) - More grid levels for finer price granularity
 * - GRID_SPACING_PERCENT: 5 (was 3.72) - Clean 5% spacing between levels
 * - MIN_PROFIT: 1.05 (was 1.08) - 5% profit target (conservative)
 * - MOONBAG_PERCENTAGE: 10 (was 20) - Keep 10% for upside
 * - BUY_COOLDOWN_MS: 30000 (was 60000) - 30 second cooldown
 */
export declare const botConfig: BotConfig;
/**
 * Wallet configuration from environment variables
 */
export declare const walletConfig: WalletConfig;
/**
 * Token configuration from environment variables
 */
export declare const tokenConfig: TokenConfig;
/**
 * Validate configuration
 */
export declare function validateConfig(): void;
/**
 * Log configuration (without sensitive data)
 */
export declare function logConfig(): Record<string, unknown>;
//# sourceMappingURL=config.d.ts.map