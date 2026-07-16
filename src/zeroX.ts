import axios, { AxiosError } from 'axios';
import { ZeroXQuote, ZeroXPrice, TradeResult } from './types.js';
import { walletConfig } from './config.js';
import { logger } from './logger.js';

const ZEROX_API_BASE = 'https://api.0x.org';
const CHAIN_ID = walletConfig.chainId;

/**
 * Retry configuration for exponential backoff
 */
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

// API request timeout in milliseconds
const API_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Make request to 0x API with retry logic
 */
async function makeRequest<T>(
  url: string,
  params: Record<string, string>,
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const response = await axios.get(url, {
        params,
        headers: {
          '0x-api-key': walletConfig.zeroXApiKey,
          '0x-version': 'v2',
        },
        timeout: API_TIMEOUT_MS,
      });
      return response.data as T;
    } catch (error) {
      lastError = error as Error;
      const axiosError = error as AxiosError;

      // Don't retry on client errors (4xx)
      if (axiosError.response && axiosError.response.status >= 400 && axiosError.response.status < 500) {
        throw error;
      }

      if (attempt < retryConfig.maxRetries) {
        const delay = calculateDelay(attempt, retryConfig);
        logger.warn(
          `0x API request failed (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}), retrying in ${delay}ms...`,
          { error: (error as Error).message }
        );
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Get a price quote from 0x API (no transaction data)
 */
export async function getPrice(
  sellToken: string,
  buyToken: string,
  sellAmount?: string,
  buyAmount?: string
): Promise<ZeroXPrice | null> {
  try {
    const params: Record<string, string> = {
      chainId: CHAIN_ID.toString(),
      sellToken,
      buyToken,
    };

    if (sellAmount) {
      params.sellAmount = sellAmount;
    } else if (buyAmount) {
      params.buyAmount = buyAmount;
    } else {
      throw new Error('Either sellAmount or buyAmount must be provided');
    }

    const price = await makeRequest<ZeroXPrice>(
      `${ZEROX_API_BASE}/swap/permit2/price`,
      params
    );

    return price;
  } catch (error) {
    logger.error('Error getting price from 0x:', error);
    return null;
  }
}

/**
 * Get a swap quote from 0x API (includes transaction data)
 * Includes anti-MEV jitter on sell amount to avoid front-running
 */
export async function getQuote(
  sellToken: string,
  buyToken: string,
  sellAmount?: string,
  buyAmount?: string,
  takerAddress?: string
): Promise<ZeroXQuote | null> {
  try {
    const params: Record<string, string> = {
      chainId: CHAIN_ID.toString(),
      sellToken,
      buyToken,
    };

    if (sellAmount) {
      // Add randomness to amount to avoid MEV front-running
      const originalAmount = BigInt(sellAmount);
      const jitteredAmount = originalAmount + BigInt(Math.floor(Math.random() * 1000));
      params.sellAmount = jitteredAmount.toString();
      
      logger.debug(`Applied anti-MEV jitter`, {
        originalAmount: originalAmount.toString(),
        jitteredAmount: jitteredAmount.toString(),
        jitter: (jitteredAmount - originalAmount).toString(),
      });
    } else if (buyAmount) {
      params.buyAmount = buyAmount;
    } else {
      throw new Error('Either sellAmount or buyAmount must be provided');
    }

    if (takerAddress) {
      params.taker = takerAddress;
    }

    logger.debug(`Getting 0x quote`, {
      sellToken,
      buyToken,
      sellAmount: sellAmount || 'N/A',
      buyAmount: buyAmount || 'N/A',
      takerAddress: takerAddress || 'N/A',
    });

    const quote = await makeRequest<ZeroXQuote>(
      `${ZEROX_API_BASE}/swap/permit2/quote`,
      params
    );

    if (quote) {
      logger.debug(`0x quote received`, {
        sellToken: quote.sellToken,
        buyToken: quote.buyToken,
        sellAmount: quote.sellAmount,
        buyAmount: quote.buyAmount,
        estimatedPriceImpact: quote.estimatedPriceImpact,
        grossPrice: quote.grossPrice,
        netPrice: quote.netPrice,
      });
    }

    return quote;
  } catch (error) {
    logger.error('Error getting quote from 0x:', error);
    return null;
  }
}

/**
 * Get token price in WETH terms
 * Returns how many WETH 1 token is worth
 */
export async function getTokenPriceInWeth(
  tokenAddress: string,
  wethAddress: string,
  decimals: number = 18
): Promise<number | null> {
  try {
    // Get price of 1 token in WETH
    const oneToken = (10n ** BigInt(decimals)).toString();
    const price = await getPrice(tokenAddress, wethAddress, oneToken);
    
    if (!price) return null;

    // buyAmount is how much WETH we get for 1 token
    const wethPerToken = parseFloat(price.buyAmount) / Math.pow(10, 18);
    
    return wethPerToken;
  } catch (error) {
    logger.error(`Error getting token price in WETH for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Get WETH price in token terms
 * Returns how many tokens 1 WETH is worth
 */
export async function getWethPriceInToken(
  tokenAddress: string,
  wethAddress: string,
  tokenDecimals: number = 18
): Promise<number | null> {
  try {
    // Get price of 1 WETH in token
    const oneWeth = (10n ** BigInt(18)).toString();
    const price = await getPrice(wethAddress, tokenAddress, oneWeth);
    
    if (!price) return null;

    // buyAmount is how many tokens we get for 1 WETH
    const tokensPerWeth = parseFloat(price.buyAmount) / Math.pow(10, tokenDecimals);
    
    return tokensPerWeth;
  } catch (error) {
    logger.error(`Error getting WETH price in token for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Get token price in USD (using WETH as reference)
 * @deprecated Use getTokenPriceInWeth for the new architecture
 */
export async function getTokenPriceInUsd(
  tokenAddress: string,
  wethAddress: string,
  decimals: number = 18
): Promise<number | null> {
  try {
    // Get price of 1 WETH in token
    const oneWeth = (10n ** BigInt(decimals)).toString();
    const price = await getPrice(wethAddress, tokenAddress, oneWeth);
    
    if (!price) return null;

    // Calculate token price in WETH terms
    const tokenPerWeth = parseFloat(price.buyAmount) / parseFloat(price.sellAmount);
    const wethPriceInToken = 1 / tokenPerWeth;

    return wethPriceInToken;
  } catch (error) {
    logger.error(`Error getting price for token ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Calculate USD value of token amount
 */
export async function calculateUsdValue(
  tokenAddress: string,
  amount: bigint,
  decimals: number,
  wethAddress: string
): Promise<number | null> {
  const price = await getTokenPriceInUsd(tokenAddress, wethAddress, decimals);
  if (price === null) return null;

  const formattedAmount = Number(amount) / Math.pow(10, decimals);
  return formattedAmount * price;
}

export { ZeroXQuote, ZeroXPrice };
