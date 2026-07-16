import { ZeroXQuote, ZeroXPrice } from './types.js';
/**
 * Get a price quote from 0x API (no transaction data)
 */
export declare function getPrice(sellToken: string, buyToken: string, sellAmount?: string, buyAmount?: string): Promise<ZeroXPrice | null>;
/**
 * Get a swap quote from 0x API (includes transaction data)
 * Includes anti-MEV jitter on sell amount to avoid front-running
 */
export declare function getQuote(sellToken: string, buyToken: string, sellAmount?: string, buyAmount?: string, takerAddress?: string): Promise<ZeroXQuote | null>;
/**
 * Get token price in USD (using WETH as reference)
 */
export declare function getTokenPriceInUsd(tokenAddress: string, wethAddress: string, decimals?: number): Promise<number | null>;
/**
 * Calculate USD value of token amount
 */
export declare function calculateUsdValue(tokenAddress: string, amount: bigint, decimals: number, wethAddress: string): Promise<number | null>;
export { ZeroXQuote, ZeroXPrice };
//# sourceMappingURL=zeroX.d.ts.map