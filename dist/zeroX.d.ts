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
 * Get token price in WETH terms
 * Returns how many WETH 1 token is worth
 */
export declare function getTokenPriceInWeth(tokenAddress: string, wethAddress: string, decimals?: number): Promise<number | null>;
/**
 * Get WETH price in token terms
 * Returns how many tokens 1 WETH is worth
 */
export declare function getWethPriceInToken(tokenAddress: string, wethAddress: string, tokenDecimals?: number): Promise<number | null>;
/**
 * Get token price in USD (using WETH as reference)
 * @deprecated Use getTokenPriceInWeth for the new architecture
 */
export declare function getTokenPriceInUsd(tokenAddress: string, wethAddress: string, decimals?: number): Promise<number | null>;
/**
 * Calculate USD value of token amount
 */
export declare function calculateUsdValue(tokenAddress: string, amount: bigint, decimals: number, wethAddress: string): Promise<number | null>;
export { ZeroXQuote, ZeroXPrice };
//# sourceMappingURL=zeroX.d.ts.map