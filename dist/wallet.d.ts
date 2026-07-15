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
 * Execute a swap transaction from a 0x quote
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
//# sourceMappingURL=wallet.d.ts.map