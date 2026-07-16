import { PrivateKeyAccount, Hex, TransactionReceipt, PublicClient, WalletClient, Chain } from 'viem';
import { TokenBalance, TradeResult } from './types.js';
import { ZeroXQuote } from './zeroX.js';
/**
 * Robinhood Chain configuration
 */
export declare const robinhoodChain: Chain;
/**
 * Create account from private key
 */
export declare function createAccount(): PrivateKeyAccount;
/**
 * Create public client for reading blockchain data
 */
export declare function createPublicClientInstance(): PublicClient;
/**
 * Create wallet client for signing transactions
 */
export declare function createWalletClientInstance(account: PrivateKeyAccount): WalletClient;
/**
 * Get token balance
 */
export declare function getTokenBalance(tokenAddress: string, ownerAddress: string): Promise<TokenBalance>;
/**
 * Check if approval is needed and approve if necessary
 */
export declare function checkAndApproveToken(tokenAddress: string, spenderAddress: string, amount: bigint, account: PrivateKeyAccount): Promise<boolean>;
/**
 * Check if Permit2 approval is needed and approve if necessary
 * 0x v2 API uses Permit2 for token transfers
 */
export declare function checkAndApprovePermit2(tokenAddress: string, amount: bigint, account: PrivateKeyAccount): Promise<boolean>;
/**
 * Check if token is approved to Permit2 for 0x swaps (read-only)
 * Permit2 returns (amount, expiration, nonce) - must check expiration too
 */
export declare function isApprovedToPermit2(tokenAddress: string, amount: bigint, account: PrivateKeyAccount): Promise<boolean>;
/**
 * Execute a swap transaction from a 0x quote
 * WARNING: 0x quotes expire quickly. Only call this if already approved.
 */
export declare function executeSwap(quote: ZeroXQuote, account: PrivateKeyAccount): Promise<TradeResult>;
/**
 * Get native ETH balance
 */
export declare function getNativeBalance(address: string): Promise<TokenBalance>;
/**
 * Wait for transaction receipt with timeout
 */
export declare function waitForTransaction(txHash: Hex, timeoutMs?: number): Promise<TransactionReceipt | null>;
/**
 * Swap WETH to trading token
 * Used when buying the trading token with WETH as quote currency
 */
export declare function swapWethToToken(tokenAddress: string, wethAmount: bigint, account: PrivateKeyAccount): Promise<TradeResult>;
/**
 * Swap trading token to WETH
 * Used when selling the trading token for WETH
 */
export declare function swapTokenToWeth(tokenAddress: string, tokenAmount: bigint, account: PrivateKeyAccount): Promise<TradeResult>;
/**
 * Swap WETH to USDG (bank profits)
 * Used to bank profits in USDG
 */
export declare function swapWethToUsd(wethAmount: bigint, account: PrivateKeyAccount): Promise<TradeResult>;
//# sourceMappingURL=wallet.d.ts.map