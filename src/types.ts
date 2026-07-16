/**
 * Position structure for grid trading
 */
export interface Position {
  /** Unique position ID */
  id: string;
  /** Token balance in the position (0 if empty) */
  balance: number;
  /** Average cost basis for the position */
  cost: number;
  /** Minimum price to buy (lower bound) */
  buyMin: number;
  /** Maximum price to buy (upper bound) */
  buyMax: number;
  /** Minimum price to sell (profit target) */
  sellMin: number;
  /** Stop loss price */
  stoploss: number;
  /** Token address */
  tokenAddress?: string;
  /** Token symbol */
  symbol?: string;
  /** Timestamp when position was created */
  createdAt?: number;
  /** Last buy timestamp */
  lastBuyAt?: number;
}

/**
 * Grid mode options
 * - pregenerated: Load positions from positions.json
 * - autogenerate: Generate all grid positions at startup
 * - dynamic: Create positions on-demand as price drops (DCA mode)
 */
export type GridMode = 'pregenerated' | 'autogenerate' | 'dynamic';

/**
 * Buy amount calculation mode
 * - static: Use fixed GRID_SIZE_USD for every buy
 * - dynamic: Calculate buy amount based on available balance divided by empty positions
 */
export type BuyAmountMode = 'static' | 'dynamic';

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
  /** Grid size in USD for new positions (used in static mode) */
  GRID_SIZE_USD: number;
  /** Profit threshold percentage to trigger sell check (e.g., 5%) */
  PROFIT_THRESHOLD_PERCENT: number;
  /** Minimum acceptable profit multiplier (e.g., 1.08 = 8% minimum profit) */
  MIN_PROFIT: number;
  /** Grid spacing percentage for dynamic generation */
  GRID_SPACING_PERCENT: number;
  /** Grid mode: pregenerated, autogenerate, or dynamic */
  GRID_MODE: GridMode;
  /** Minimum amount required to bank profits (in token units) */
  BANK_MIN_AMOUNT: number;
  /** Buy amount calculation mode: static or dynamic */
  BUY_AMOUNT_MODE: BuyAmountMode;
  /** ETH to reserve for gas (default: 0.01) - used in dynamic mode */
  GAS_RESERVE_ETH: number;
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
  /** WETH address (quote currency, like SOL in Python bot) */
  wethAddress: string;
  /** Trading token address (the coin you want to trade, e.g., COMPUTE) */
  tradingTokenAddress: string;
  /** Trading token symbol (e.g., "COMPUTE") */
  tradingTokenSymbol: string;
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
 * Uses Record format for easy position lookup by ID
 */
export interface PositionsData {
  positions: Record<string, Position>;
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
