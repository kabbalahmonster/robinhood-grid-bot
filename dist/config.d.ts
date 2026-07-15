import { BotConfig, WalletConfig, TokenConfig } from './types.js';
/**
 * Bot configuration from environment variables
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