"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrice = getPrice;
exports.getQuote = getQuote;
exports.getTokenPriceInUsd = getTokenPriceInUsd;
exports.calculateUsdValue = calculateUsdValue;
const axios_1 = __importDefault(require("axios"));
const config_js_1 = require("./config.js");
const logger_js_1 = require("./logger.js");
const ZEROX_API_BASE = 'https://api.0x.org';
const CHAIN_ID = config_js_1.walletConfig.chainId;
const DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
};
/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt, config) {
    const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}
/**
 * Make request to 0x API with retry logic
 */
async function makeRequest(url, params, retryConfig = DEFAULT_RETRY_CONFIG) {
    let lastError;
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
        try {
            const response = await axios_1.default.get(url, {
                params,
                headers: {
                    '0x-api-key': config_js_1.walletConfig.zeroXApiKey,
                    '0x-version': 'v2',
                },
                timeout: 30000,
            });
            return response.data;
        }
        catch (error) {
            lastError = error;
            const axiosError = error;
            // Don't retry on client errors (4xx)
            if (axiosError.response && axiosError.response.status >= 400 && axiosError.response.status < 500) {
                throw error;
            }
            if (attempt < retryConfig.maxRetries) {
                const delay = calculateDelay(attempt, retryConfig);
                logger_js_1.logger.warn(`0x API request failed (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}), retrying in ${delay}ms...`, { error: error.message });
                await sleep(delay);
            }
        }
    }
    throw lastError || new Error('Max retries exceeded');
}
/**
 * Get a price quote from 0x API (no transaction data)
 */
async function getPrice(sellToken, buyToken, sellAmount, buyAmount) {
    try {
        const params = {
            chainId: CHAIN_ID.toString(),
            sellToken,
            buyToken,
        };
        if (sellAmount) {
            params.sellAmount = sellAmount;
        }
        else if (buyAmount) {
            params.buyAmount = buyAmount;
        }
        else {
            throw new Error('Either sellAmount or buyAmount must be provided');
        }
        const price = await makeRequest(`${ZEROX_API_BASE}/swap/permit2/price`, params);
        return price;
    }
    catch (error) {
        logger_js_1.logger.error('Error getting price from 0x:', error);
        return null;
    }
}
/**
 * Get a swap quote from 0x API (includes transaction data)
 */
async function getQuote(sellToken, buyToken, sellAmount, buyAmount, takerAddress) {
    try {
        const params = {
            chainId: CHAIN_ID.toString(),
            sellToken,
            buyToken,
        };
        if (sellAmount) {
            params.sellAmount = sellAmount;
        }
        else if (buyAmount) {
            params.buyAmount = buyAmount;
        }
        else {
            throw new Error('Either sellAmount or buyAmount must be provided');
        }
        if (takerAddress) {
            params.taker = takerAddress;
        }
        const quote = await makeRequest(`${ZEROX_API_BASE}/swap/permit2/quote`, params);
        return quote;
    }
    catch (error) {
        logger_js_1.logger.error('Error getting quote from 0x:', error);
        return null;
    }
}
/**
 * Get token price in USD (using WETH as reference)
 */
async function getTokenPriceInUsd(tokenAddress, wethAddress, decimals = 18) {
    try {
        // Get price of 1 WETH in token
        const oneWeth = (10n ** BigInt(decimals)).toString();
        const price = await getPrice(wethAddress, tokenAddress, oneWeth);
        if (!price)
            return null;
        // Calculate token price in WETH terms
        const tokenPerWeth = parseFloat(price.buyAmount) / parseFloat(price.sellAmount);
        const wethPriceInToken = 1 / tokenPerWeth;
        return wethPriceInToken;
    }
    catch (error) {
        logger_js_1.logger.error(`Error getting price for token ${tokenAddress}:`, error);
        return null;
    }
}
/**
 * Calculate USD value of token amount
 */
async function calculateUsdValue(tokenAddress, amount, decimals, wethAddress) {
    const price = await getTokenPriceInUsd(tokenAddress, wethAddress, decimals);
    if (price === null)
        return null;
    const formattedAmount = Number(amount) / Math.pow(10, decimals);
    return formattedAmount * price;
}
//# sourceMappingURL=zeroX.js.map