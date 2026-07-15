/**
 * Position structure for grid trading
 */
export interface Position {
    /** Token balance in the position */
    balance: string;
    /** Average cost basis for the position */
    cost: string;
    /** Minimum price to buy (lower bound) */
    buyMin: string;
    /** Maximum price to buy (upper bound) */
    buyMax: string;
    /** Minimum price to sell (profit target) */
    sellMin: string;
    /** Stop loss price */
    stoploss: string;
    /** Token address */
    tokenAddress: string;
    /** Token symbol */
    symbol: string;
    /** Timestamp when position was created */
    createdAt: number;
    /** Last buy timestamp */
    lastBuyAt: number;
}
/**
 * Configuration flags matching Python bot
 */
export interface BotConfig {
    /** Bank profits in USDG */
    BANK_PROFIT: boolean;
    /** Enable sell orders */
    SELLS_ACTIVE: boolean;
    /** Enable buy orders */
    BUYS_ACTIVE: boolean;
    /** Bank moonbag percentage */
    BANK_MOONBAG: boolean;
    /** Enable stop loss protection */
    STOPLOSS_ACTIVE: boolean;
    /** Percentage to keep as moonbag on sell (0-100) */
    MOONBAG_PERCENTAGE: number;
    /** Stop loss percentage threshold (negative number) */
    STOPLOSS_PERCENTAGE: number;
    /** Maximum number of open positions */
    MAX_POSITIONS: number;
    /** Interval between checks in milliseconds */
    CHECK_INTERVAL_MS: number;
    /** Cooldown between buys for same token in milliseconds */
    BUY_COOLDOWN_MS: number;
    /** Grid size in USD for new positions */
    GRID_SIZE_USD: number;
    /** Profit threshold percentage to trigger sell */
    PROFIT_THRESHOLD_PERCENT: number;
}
/**
 * Wallet and blockchain configuration
 */
export interface WalletConfig {
    /** Private key for signing transactions */
    privateKey: string;
    /** RPC endpoint URL */
    rpcUrl: string;
    /** Chain ID */
    chainId: number;
    /** 0x API key */
    zeroXApiKey: string;
}
/**
 * Token addresses configuration
 */
export interface TokenConfig {
    /** USDG (reserve/bank currency) address */
    usdgAddress: string;
    /** WETH address for quotes */
    wethAddress: string;
}
/**
 * 0x API Quote response
 */
export interface ZeroXQuote {
    chainId: number;
    buyToken: string;
    sellToken: string;
    buyAmount: string;
    sellAmount: string;
    allowanceTarget: string;
    transaction: {
        to: string;
        data: string;
        value: string;
        gas: string;
        gasPrice: string;
    };
    minBuyAmount?: string;
    estimatedPriceImpact: string;
    grossPrice: string;
    netPrice: string;
}
/**
 * 0x API Price response
 */
export interface ZeroXPrice {
    buyToken: string;
    sellToken: string;
    buyAmount: string;
    sellAmount: string;
    estimatedPriceImpact: string;
    grossPrice: string;
    netPrice: string;
}
/**
 * Position data stored in JSON file
 */
export interface PositionsData {
    positions: Position[];
    lastUpdated: number;
    version: string;
}
/**
 * Trade execution result
 */
export interface TradeResult {
    success: boolean;
    txHash?: string;
    error?: string;
    buyAmount?: string;
    sellAmount?: string;
    price?: string;
}
/**
 * Token balance information
 */
export interface TokenBalance {
    address: string;
    symbol: string;
    balance: bigint;
    decimals: number;
    formattedBalance: string;
}
/**
 * Price information for a token pair
 */
export interface PriceInfo {
    tokenIn: string;
    tokenOut: string;
    price: number;
    timestamp: number;
}
//# sourceMappingURL=types.d.ts.map