import { Hex } from 'viem';
import { Position, TradeResult } from './types.js';
import { botConfig, tokenConfig } from './config.js';
import { logger, logTrade, logPosition } from './logger.js';
import {
  loadPositions,
  savePositions,
  addPosition,
  updatePosition,
  removePosition,
  getPositionByToken,
} from './storage.js';
import {
  getQuote,
  getPrice,
  getTokenPriceInUsd,
  ZeroXQuote,
} from './zeroX.js';
import {
  createAccount,
  getTokenBalance,
  executeSwap,
  createPublicClientInstance,
} from './wallet.js';

/**
 * Grid Trading Bot for Robinhood Chain
 */
export class GridBot {
  private positions: Position[] = [];
  private account = createAccount();
  private running = false;
  private checkInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the bot
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Grid Bot...');
    logger.info('Wallet address:', { address: this.account.address });

    // Load existing positions
    this.positions = await loadPositions();
    logger.info(`Loaded ${this.positions.length} positions`);

    // Log configuration
    logger.info('Bot configuration:', {
      BANK_PROFIT: botConfig.BANK_PROFIT,
      SELLS_ACTIVE: botConfig.SELLS_ACTIVE,
      BUYS_ACTIVE: botConfig.BUYS_ACTIVE,
      BANK_MOONBAG: botConfig.BANK_MOONBAG,
      STOPLOSS_ACTIVE: botConfig.STOPLOSS_ACTIVE,
      MAX_POSITIONS: botConfig.MAX_POSITIONS,
    });
  }

  /**
   * Start the bot
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('Bot is already running');
      return;
    }

    this.running = true;
    logger.info('Starting Grid Bot...');

    // Run initial check
    await this.checkAllPositions();

    // Set up interval for regular checks
    this.checkInterval = setInterval(() => {
      this.checkAllPositions().catch((error) => {
        logger.error('Error in position check:', error);
      });
    }, botConfig.CHECK_INTERVAL_MS);

    logger.info(`Bot started. Checking every ${botConfig.CHECK_INTERVAL_MS}ms`);
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    this.running = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    logger.info('Bot stopped');
  }

  /**
   * Check all positions and execute trades as needed
   */
  private async checkAllPositions(): Promise<void> {
    const timestamp = new Date().toISOString();
    logger.debug(`=== Checking positions at ${timestamp} ===`);

    // Get current USDG balance for potential buys
    const usdgBalance = await getTokenBalance(
      tokenConfig.usdgAddress,
      this.account.address
    );
    logger.debug(`USDG Balance: ${usdgBalance.formattedBalance}`);

    // Check existing positions for sells/stoploss
    for (let i = this.positions.length - 1; i >= 0; i--) {
      const position = this.positions[i];
      await this.checkPositionForSell(position, i);
    }

    // Check for new buy opportunities if we have capacity and USDG
    if (
      botConfig.BUYS_ACTIVE &&
      this.positions.length < botConfig.MAX_POSITIONS &&
      parseFloat(usdgBalance.formattedBalance) >= botConfig.GRID_SIZE_USD
    ) {
      await this.checkForBuyOpportunities();
    }

    // Save positions after all checks
    await savePositions(this.positions);
  }

  /**
   * Check a single position for sell conditions
   */
  private async checkPositionForSell(
    position: Position,
    index: number
  ): Promise<void> {
    try {
      // Get current price
      const currentPrice = await getTokenPriceInUsd(
        position.tokenAddress,
        tokenConfig.wethAddress
      );

      if (currentPrice === null) {
        logger.warn(`Could not get price for ${position.symbol}`);
        return;
      }

      const costBasis = parseFloat(position.cost);
      const profitPercent = ((currentPrice - costBasis) / costBasis) * 100;
      const stoplossPrice = parseFloat(position.stoploss);
      const sellMinPrice = parseFloat(position.sellMin);

      logger.debug(`Position check: ${position.symbol}`, {
        currentPrice,
        costBasis,
        profitPercent,
        stoplossPrice,
        sellMinPrice,
      });

      // Check stop loss first
      if (botConfig.STOPLOSS_ACTIVE && currentPrice <= stoplossPrice) {
        logger.warn(`STOP LOSS triggered for ${position.symbol}!`, {
          currentPrice,
          stoplossPrice,
          loss: profitPercent.toFixed(2) + '%',
        });
        await this.executeStopLoss(position, index);
        return;
      }

      // Check profit target
      if (botConfig.SELLS_ACTIVE && currentPrice >= sellMinPrice) {
        logger.info(`Profit target reached for ${position.symbol}!`, {
          currentPrice,
          target: sellMinPrice,
          profit: profitPercent.toFixed(2) + '%',
        });
        await this.executeSell(position, index, currentPrice);
      }
    } catch (error) {
      logger.error(`Error checking position ${position.symbol}:`, error);
    }
  }

  /**
   * Execute stop loss sell
   */
  private async executeStopLoss(
    position: Position,
    index: number
  ): Promise<void> {
    const balance = await getTokenBalance(
      position.tokenAddress,
      this.account.address
    );

    if (balance.balance === 0n) {
      logger.warn(`No balance to sell for ${position.symbol}`);
      await removePosition(this.positions, index);
      return;
    }

    const result = await this.swapTokenToUsd(
      position.tokenAddress,
      balance.balance
    );

    if (result.success) {
      const { updated, removed } = await removePosition(this.positions, index);
      this.positions = updated;
      logTrade('STOPLOSS', position.symbol, {
        balance: balance.formattedBalance,
        cost: position.cost,
        txHash: result.txHash,
      });
      logger.info(`Stop loss executed for ${position.symbol}: ${result.txHash}`);
    } else {
      logger.error(`Stop loss failed for ${position.symbol}: ${result.error}`);
    }
  }

  /**
   * Execute profit-taking sell with optional moonbag
   */
  private async executeSell(
    position: Position,
    index: number,
    currentPrice: number
  ): Promise<void> {
    const balance = await getTokenBalance(
      position.tokenAddress,
      this.account.address
    );

    if (balance.balance === 0n) {
      logger.warn(`No balance to sell for ${position.symbol}`);
      await removePosition(this.positions, index);
      return;
    }

    // Calculate sell amount (considering moonbag)
    let sellAmount = balance.balance;
    let moonbagAmount = 0n;

    if (botConfig.BANK_MOONBAG && botConfig.MOONBAG_PERCENTAGE > 0) {
      moonbagAmount = (balance.balance * BigInt(botConfig.MOONBAG_PERCENTAGE)) / 100n;
      sellAmount = balance.balance - moonbagAmount;

      logger.info(`Keeping moonbag for ${position.symbol}:`, {
        percentage: botConfig.MOONBAG_PERCENTAGE,
        amount: (Number(moonbagAmount) / Math.pow(10, balance.decimals)).toFixed(6),
      });
    }

    // Execute the sell
    const result = await this.swapTokenToUsd(
      position.tokenAddress,
      sellAmount
    );

    if (result.success) {
      if (moonbagAmount > 0n) {
        // Update position with remaining moonbag
        const newCost = currentPrice.toString();
        await updatePosition(this.positions, index, {
          balance: moonbagAmount.toString(),
          cost: newCost,
          buyMin: (currentPrice * 0.95).toString(), // 5% below current
          buyMax: (currentPrice * 1.05).toString(), // 5% above current
          sellMin: (currentPrice * 1.05).toString(), // 5% profit target
          stoploss: (currentPrice * 0.9).toString(), // 10% stop loss
        });
        logTrade('MOONBAG', position.symbol, {
          remainingBalance: (Number(moonbagAmount) / Math.pow(10, balance.decimals)).toFixed(6),
          newCostBasis: newCost,
        });
      } else {
        // Full sell - remove position
        const { updated } = await removePosition(this.positions, index);
        this.positions = updated;
      }

      logTrade('SELL', position.symbol, {
        amount: (Number(sellAmount) / Math.pow(10, balance.decimals)).toFixed(6),
        price: currentPrice,
        profit: (((currentPrice - parseFloat(position.cost)) / parseFloat(position.cost)) * 100).toFixed(2) + '%',
        txHash: result.txHash,
      });

      logger.info(`Sell executed for ${position.symbol}: ${result.txHash}`);
    } else {
      logger.error(`Sell failed for ${position.symbol}: ${result.error}`);
    }
  }

  /**
   * Check for new buy opportunities
   */
  private async checkForBuyOpportunities(): Promise<void> {
    // For now, we'll use WETH as the primary trading token
    // In a real implementation, you might scan multiple tokens
    const targetToken = tokenConfig.wethAddress;

    // Check if we already have a position for this token
    if (getPositionByToken(this.positions, targetToken).position !== null) {
      return;
    }

    // Get current price
    const currentPrice = await getTokenPriceInUsd(
      targetToken,
      tokenConfig.wethAddress
    );

    if (currentPrice === null) {
      return;
    }

    // Calculate grid levels
    const buyMax = currentPrice * 1.02; // Buy if price is within 2% of current
    const buyMin = currentPrice * 0.98;
    const sellMin = currentPrice * 1.05; // 5% profit target
    const stoploss = currentPrice * 0.9; // 10% stop loss

    // Check if current price is within buy range
    if (currentPrice >= buyMin && currentPrice <= buyMax) {
      logger.info(`Buy opportunity found for WETH at ${currentPrice}`);
      await this.executeBuy(targetToken, 'WETH', currentPrice);
    }
  }

  /**
   * Execute a buy order
   */
  private async executeBuy(
    tokenAddress: string,
    symbol: string,
    currentPrice: number
  ): Promise<void> {
    // Convert USDG amount to base units (USDG has 18 decimals)
    const buyAmountUsd = parseFloat(
      (botConfig.GRID_SIZE_USD * Math.pow(10, 18)).toFixed(0)
    );

    const result = await this.swapUsdToToken(tokenAddress, BigInt(buyAmountUsd));

    if (result.success && result.buyAmount) {
      // Create new position
      const newPosition: Position = {
        balance: result.buyAmount,
        cost: currentPrice.toString(),
        buyMin: (currentPrice * 0.95).toString(),
        buyMax: (currentPrice * 1.05).toString(),
        sellMin: (currentPrice * 1.05).toString(),
        stoploss: (currentPrice * 0.9).toString(),
        tokenAddress,
        symbol,
        createdAt: Date.now(),
        lastBuyAt: Date.now(),
      };

      this.positions = await addPosition(this.positions, newPosition);
      logTrade('BUY', symbol, {
        amount: result.buyAmount,
        cost: currentPrice,
        txHash: result.txHash,
      });
      logger.info(`Buy executed for ${symbol}: ${result.txHash}`);
    } else {
      logger.error(`Buy failed for ${symbol}: ${result.error}`);
    }
  }

  /**
   * Swap USDG to token
   */
  private async swapUsdToToken(
    tokenAddress: string,
    usdAmount: bigint
  ): Promise<TradeResult> {
    const quote = await getQuote(
      tokenConfig.usdgAddress,
      tokenAddress,
      usdAmount.toString(),
      undefined,
      this.account.address
    );

    if (!quote) {
      return { success: false, error: 'Failed to get quote' };
    }

    return executeSwap(quote, this.account);
  }

  /**
   * Swap token to USDG
   */
  private async swapTokenToUsd(
    tokenAddress: string,
    tokenAmount: bigint
  ): Promise<TradeResult> {
    const quote = await getQuote(
      tokenAddress,
      tokenConfig.usdgAddress,
      tokenAmount.toString(),
      undefined,
      this.account.address
    );

    if (!quote) {
      return { success: false, error: 'Failed to get quote' };
    }

    return executeSwap(quote, this.account);
  }

  /**
   * Get current positions
   */
  getPositions(): Position[] {
    return [...this.positions];
  }

  /**
   * Check if bot is running
   */
  isRunning(): boolean {
    return this.running;
  }
}
