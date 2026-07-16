"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenConfig = exports.walletConfig = exports.botConfig = void 0;
exports.validateConfig = validateConfig;
exports.logConfig = logConfig;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
/**
 * Parse boolean from environment variable
 */
function parseBool(value, defaultValue) {
    if (value === undefined)
        return defaultValue;
    return value.toLowerCase() === 'true';
}
/**
 * Parse number from environment variable
 */
function parseNumber(value, defaultValue) {
    if (value === undefined)
        return defaultValue;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
}
/**
 * Parse grid mode from environment variable
 */
function parseGridMode(value, defaultValue) {
    if (value === undefined)
        return defaultValue;
    const validModes = ['pregenerated', 'autogenerate', 'dynamic'];
    if (validModes.includes(value)) {
        return value;
    }
    return defaultValue;
}
/**
 * Parse buy amount mode from environment variable
 */
function parseBuyAmountMode(value, defaultValue) {
    if (value === undefined)
        return defaultValue;
    const validModes = ['static', 'dynamic'];
    if (validModes.includes(value)) {
        return value;
    }
    return defaultValue;
}
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
exports.botConfig = {
    // Feature Toggles
    BANK_PROFIT: parseBool(process.env.BANK_PROFIT, true),
    SELLS_ACTIVE: parseBool(process.env.SELLS_ACTIVE, true),
    BUYS_ACTIVE: parseBool(process.env.BUYS_ACTIVE, true),
    BANK_MOONBAG: parseBool(process.env.BANK_MOONBAG, true),
    STOPLOSS_ACTIVE: parseBool(process.env.STOPLOSS_ACTIVE, true),
    // Profit & Safety Settings
    MOONBAG_PERCENTAGE: parseNumber(process.env.MOONBAG_PERCENTAGE, 10),
    STOPLOSS_PERCENTAGE: parseNumber(process.env.STOPLOSS_PERCENTAGE, -10),
    PROFIT_THRESHOLD_PERCENT: parseNumber(process.env.PROFIT_THRESHOLD_PERCENT, 5),
    MIN_PROFIT: parseNumber(process.env.MIN_PROFIT, 1.05),
    BANK_MIN_AMOUNT: parseNumber(process.env.BANK_MIN_AMOUNT, 1.0),
    // Grid Settings
    MAX_POSITIONS: parseNumber(process.env.MAX_POSITIONS, 20),
    GRID_SIZE_USD: parseNumber(process.env.GRID_SIZE_USD, 10),
    GRID_SPACING_PERCENT: parseNumber(process.env.GRID_SPACING_PERCENT, 5),
    GRID_MODE: parseGridMode(process.env.GRID_MODE, 'dynamic'),
    BUY_AMOUNT_MODE: parseBuyAmountMode(process.env.BUY_AMOUNT_MODE, 'dynamic'),
    // Timing & Gas
    CHECK_INTERVAL_MS: parseNumber(process.env.CHECK_INTERVAL_MS, 10000),
    BUY_COOLDOWN_MS: parseNumber(process.env.BUY_COOLDOWN_MS, 30000),
    GAS_RESERVE_ETH: parseNumber(process.env.GAS_RESERVE_ETH, 0.001),
};
/**
 * Build RPC URL - uses Alchemy if key provided, otherwise falls back to env or default
 */
function buildRpcUrl() {
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    if (alchemyKey) {
        // Robinhood Chain on Alchemy
        return `https://robinhood-mainnet.g.alchemy.com/v2/${alchemyKey}`;
    }
    return process.env.RPC_URL || 'https://rpc.robinhoodchain.com';
}
/**
 * Wallet configuration from environment variables
 */
exports.walletConfig = {
    privateKey: process.env.PRIVATE_KEY || '',
    rpcUrl: buildRpcUrl(),
    chainId: parseNumber(process.env.CHAIN_ID, 4663),
    zeroXApiKey: process.env.ZEROX_API_KEY || '',
};
/**
 * Token configuration from environment variables
 *
 * TRADING TOKEN SETUP (like Python bot):
 * - WETH = quote currency (like SOL)
 * - TRADING_TOKEN = coin being traded (e.g., COMPUTE)
 * - USDG = bank currency (stablecoin)
 */
exports.tokenConfig = {
    usdgAddress: process.env.USDG_ADDRESS || '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    wethAddress: process.env.WETH_ADDRESS || '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
    tradingTokenAddress: process.env.TRADING_TOKEN_ADDRESS || process.env.WETH_ADDRESS || '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
    tradingTokenSymbol: process.env.TRADING_TOKEN_SYMBOL || 'WETH',
    permit2Address: '0x000000000022d473030f116ddee9f6b43ac78ba3', // Permit2 contract on all EVM chains (lowercase for viem)
};
/**
 * Validate configuration
 */
function validateConfig() {
    const errors = [];
    if (!exports.walletConfig.privateKey) {
        errors.push('PRIVATE_KEY is required');
    }
    if (!exports.walletConfig.zeroXApiKey) {
        errors.push('ZEROX_API_KEY is required');
    }
    if (exports.botConfig.MOONBAG_PERCENTAGE < 0 || exports.botConfig.MOONBAG_PERCENTAGE > 100) {
        errors.push('MOONBAG_PERCENTAGE must be between 0 and 100');
    }
    if (exports.botConfig.STOPLOSS_PERCENTAGE >= 0) {
        errors.push('STOPLOSS_PERCENTAGE must be negative (e.g., -10 for 10% loss)');
    }
    if (exports.botConfig.GRID_SPACING_PERCENT <= 0) {
        errors.push('GRID_SPACING_PERCENT must be positive');
    }
    const validModes = ['pregenerated', 'autogenerate', 'dynamic'];
    if (!validModes.includes(exports.botConfig.GRID_MODE)) {
        errors.push(`GRID_MODE must be one of: ${validModes.join(', ')}`);
    }
    const validBuyModes = ['static', 'dynamic'];
    if (!validBuyModes.includes(exports.botConfig.BUY_AMOUNT_MODE)) {
        errors.push(`BUY_AMOUNT_MODE must be one of: ${validBuyModes.join(', ')}`);
    }
    if (exports.botConfig.GAS_RESERVE_ETH < 0) {
        errors.push('GAS_RESERVE_ETH must be non-negative');
    }
    if (errors.length > 0) {
        throw new Error(`Configuration errors:\n${errors.join('\n')}`);
    }
}
/**
 * Log configuration (without sensitive data)
 */
function logConfig() {
    return {
        bot: {
            BANK_PROFIT: exports.botConfig.BANK_PROFIT,
            SELLS_ACTIVE: exports.botConfig.SELLS_ACTIVE,
            BUYS_ACTIVE: exports.botConfig.BUYS_ACTIVE,
            BANK_MOONBAG: exports.botConfig.BANK_MOONBAG,
            STOPLOSS_ACTIVE: exports.botConfig.STOPLOSS_ACTIVE,
            MOONBAG_PERCENTAGE: exports.botConfig.MOONBAG_PERCENTAGE,
            STOPLOSS_PERCENTAGE: exports.botConfig.STOPLOSS_PERCENTAGE,
            MAX_POSITIONS: exports.botConfig.MAX_POSITIONS,
            CHECK_INTERVAL_MS: exports.botConfig.CHECK_INTERVAL_MS,
            BUY_COOLDOWN_MS: exports.botConfig.BUY_COOLDOWN_MS,
            GRID_SIZE_USD: exports.botConfig.GRID_SIZE_USD,
            PROFIT_THRESHOLD_PERCENT: exports.botConfig.PROFIT_THRESHOLD_PERCENT,
            MIN_PROFIT: exports.botConfig.MIN_PROFIT,
            GRID_SPACING_PERCENT: exports.botConfig.GRID_SPACING_PERCENT,
            GRID_MODE: exports.botConfig.GRID_MODE,
            BANK_MIN_AMOUNT: exports.botConfig.BANK_MIN_AMOUNT,
            BUY_AMOUNT_MODE: exports.botConfig.BUY_AMOUNT_MODE,
            GAS_RESERVE_ETH: exports.botConfig.GAS_RESERVE_ETH,
        },
        wallet: {
            rpcUrl: exports.walletConfig.rpcUrl,
            chainId: exports.walletConfig.chainId,
            hasApiKey: !!exports.walletConfig.zeroXApiKey,
            hasPrivateKey: !!exports.walletConfig.privateKey,
        },
        tokens: exports.tokenConfig,
    };
}
//# sourceMappingURL=config.js.map