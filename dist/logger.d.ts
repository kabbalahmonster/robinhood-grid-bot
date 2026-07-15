import winston from 'winston';
/**
 * Create winston logger with console and file transports
 */
export declare const logger: winston.Logger;
/**
 * Log a trade event to the trades log file
 */
export declare function logTrade(type: 'BUY' | 'SELL' | 'STOPLOSS' | 'MOONBAG' | 'BANK', tokenSymbol: string, details: Record<string, unknown>): void;
/**
 * Log grid position update
 */
export declare function logPosition(action: 'CREATE' | 'UPDATE' | 'CLOSE', position: Record<string, unknown>): void;
/**
 * Log price check
 */
export declare function logPriceCheck(tokenSymbol: string, currentPrice: number, thresholds: Record<string, number>): void;
//# sourceMappingURL=logger.d.ts.map