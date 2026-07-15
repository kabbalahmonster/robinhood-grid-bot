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
 * Bot configuration from environment variables
 */
exports.botConfig = {
    BANK_PROFIT: parseBool(process.env.BANK_PROFIT, true),
    SELLS_ACTIVE: parseBool(process.env.SELLS_ACTIVE, true),
    BUYS_ACTIVE: parseBool(process.env.BUYS_ACTIVE, true),
    BANK_MOONBAG: parseBool(process.env.BANK_MOONBAG, true),
    STOPLOSS_ACTIVE: parseBool(process.env.STOPLOSS_ACTIVE, true),
    MOONBAG_PERCENTAGE: parseNumber(process.env.MOONBAG_PERCENTAGE, 20),
    STOPLOSS_PERCENTAGE: parseNumber(process.env.STOPLOSS_PERCENTAGE, -10),
    MAX_POSITIONS: parseNumber(process.env.MAX_POSITIONS, 10),
    CHECK_INTERVAL_MS: parseNumber(process.env.CHECK_INTERVAL_MS, 30000),
    BUY_COOLDOWN_MS: parseNumber(process.env.BUY_COOLDOWN_MS, 60000),
    GRID_SIZE_USD: parseNumber(process.env.GRID_SIZE_USD, 100),
    PROFIT_THRESHOLD_PERCENT: parseNumber(process.env.PROFIT_THRESHOLD_PERCENT, 5),
};
/**
 * Wallet configuration from environment variables
 */
exports.walletConfig = {
    privateKey: process.env.PRIVATE_KEY || '',
    rpcUrl: process.env.RPC_URL || 'https://robinhood.rh-chain.com',
    chainId: parseNumber(process.env.CHAIN_ID, 4663),
    zeroXApiKey: process.env.ZEROX_API_KEY || '',
};
/**
 * Token configuration from environment variables
 */
exports.tokenConfig = {
    usdgAddress: process.env.USDG_ADDRESS || '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    wethAddress: process.env.WETH_ADDRESS || '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
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