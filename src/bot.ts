import { Hex } from 'viem';
import { Position, TradeResult, TokenBalance } from './types.js';
import { botConfig, tokenConfig } from './config.js';
import { logger, logTrade, logPosition } from './logger.js';
import {
  loadPositions,
  savePositions,
  savePosition,
  updatePosition,
  removePosition,
  getPositionsArray,
  getEmptyPositions,
  getFilledPositions,
  initializePositions,
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
 * Supports pre-generated grid positions loaded from JSON
 * Supports auto-generated grid positions at startup
 * Supports dynamic on-demand positions (DCA on drops)
 */
export class GridBot {
  private positions: Record<string, Position> = {};
  private account = createAccount();
  private running = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastBuyPrice: number = 0;
  private positionsCreated: number = 0;

  /**
   * Initialize the bot
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Grid Bot...');
    logger.info('Wallet address:', { address: this.account.address });

    // Log configuration
    logger.info('Bot configuration:', {
      BANK_PROFIT: botConfig.BANK_PROFIT,
      SELLS_ACTIVE: botConfig.SELLS_ACTIVE,
      BUYS_ACTIVE: botConfig.BUYS_ACTIVE,
      BANK_MOONBAG: botConfig.BANK_MOONBAG,
      STOPLOSS_ACTIVE: botConfig.STOPLOSS_ACTIVE,
      MAX_POSITIONS: botConfig.MAX_POSITIONS,
      GRID_SPACING_PERCENT: botConfig.GRID_SPACING_PERCENT,
      GRID_MODE: botConfig.GRID_MODE,
      BUY_AMOUNT_MODE: botConfig.BUY_AMOUNT_MODE,
      GAS_RESERVE_ETH: botConfig.GAS_RESERVE_ETH,
      GRID_SIZE_USD: botConfig.GRID_SIZE_USD,
    });

    // Handle different grid modes
    if (botConfig.GRID_MODE === 'dynamic') {
      // Dynamic mode: Start fresh, positions created on-demand
      this.positions = await loadPositions();
      this.positionsCreated = Object.keys(this.positions).length;
      
      // Find the last buy price from existing filled positions
      const filledPositions = getFilledPositions(this.positions);
      if (filledPositions.length > 0) {
        // Get the most recently created position with balance
        const lastPosition = filledPositions.sort((a, b) => 
          (b.createdAt || 0) - (a.createdAt || 0)
        )[0];
        this.lastBuyPrice = lastPosition.cost;
        logger.info(`Dynamic mode: Found ${this.positionsCreated} existing positions, last buy at ${this.lastBuyPrice}`);
      } else {
        logger.info('Dynamic mode: Starting fresh, no existing positions');
      }
    } else if (botConfig.GRID_MODE === 'autogenerate') {
      // Auto-generate mode: Generate grid positions at startup
      const currentPrice = await getTokenPriceInUsd(
        tokenConfig.wethAddress,
        tokenConfig.wethAddress
      );
      
      if (currentPrice) {
        this.positions = await initializePositions(
          true,
          currentPrice,
          botConfig.GRID_SIZE_USD,
          botConfig.GRID_SPACING_PERCENT,
          botConfig.MAX_POSITIONS,
          tokenConfig.wethAddress,
          'WETH'
        );
        logger.info(`Auto-generated ${Object.keys(this.positions).length} grid positions`);
      } else {
        logger.warn('Could not get current price for auto-generation, starting with empty positions');
        this.positions = {};
      }
    } else {
      // Pregenerated mode: Load positions from positions.json
      this.positions = await loadPositions();
      const positionCount = Object.keys(this.positions).length;
      logger.info(`Pregenerated mode: Loaded ${positionCount} positions from storage`);
    }

    // Log loaded positions summary
    const positionCount = Object.keys(this.positions).length;
    if (positionCount > 0) {
      const filledPositions = getFilledPositions(this.positions);
      const emptyPositions = getEmptyPositions(this.positions);
      logger.info('Positions summary:', {
        total: positionCount,
        filled: filledPositions.length,
        empty: emptyPositions.length,
      });
    }
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
   * New behavior: Check ALL empty positions for buy opportunities
   * Check ALL filled positions for sell/stoploss conditions
   * Dynamic mode: Create positions on-demand when price drops
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

    // Get current price for the target token (WETH)
    const currentPrice = await getTokenPriceInUsd(
      tokenConfig.wethAddress,
      tokenConfig.wethAddress
    );

    if (currentPrice === null) {
      logger.warn('Could not get current price, skipping check');
      return;
    }

    logger.debug(`Current price: ${currentPrice}`);

    // Check ALL filled positions for sell/stoploss opportunities
    const filledPositions = getFilledPositions(this.positions);
    logger.debug(`Checking ${filledPositions.length} filled positions for sell conditions`);

    for (const position of filledPositions) {
      await this.checkPositionForSell(position, currentPrice);
    }

    // Handle buys based on grid mode
    if (botConfig.BUYS_ACTIVE && parseFloat(usdgBalance.formattedBalance) >= botConfig.GRID_SIZE_USD) {
      if (botConfig.GRID_MODE === 'dynamic') {
        // Dynamic mode: Create positions on-demand
        await this.checkDynamicBuyOpportunity(currentPrice);
      } else {
        // Pregenerated/Autogenerate mode: Check existing empty positions
        const emptyPositions = getEmptyPositions(this.positions);
        logger.debug(`Checking ${emptyPositions.length} empty positions for buy opportunities`);

        for (const position of emptyPositions) {
          await this.checkPositionForBuy(position, currentPrice);
        }
      }
    }

    // Save positions after all checks
    await savePositions(this.positions);
  }

  /**
   * Check a single position for buy conditions
   * Buy logic: If position is empty (balance=0) and current price is within buyMin-buyMax range
   */
  private async checkPositionForBuy(
    position: Position,
    currentPrice: number
  ): Promise<void> {
    try {
      // Only check empty positions
      if (position.balance !== 0) {
        return;
      }

      logger.debug(`Checking buy for position ${position.id}`, {
        currentPrice,
        buyMin: position.buyMin,
        buyMax: position.buyMax,
      });

      // Check if current price is within buy range
      if (currentPrice >= position.buyMin && currentPrice <= position.buyMax) {
        logger.info(`Buy opportunity found for position ${position.id}!`, {
          currentPrice,
          buyMin: position.buyMin,
          buyMax: position.buyMax,
        });
        await this.executeBuy(position, currentPrice);
      }
    } catch (error) {
      logger.error(`Error checking buy for position ${position.id}:`, error);
    }
  }

  /**
   * Dynamic mode: Check for buy opportunities based on price drops
   * Creates new positions on-demand when price drops by GRID_SPACING_PERCENT
   */
  private async checkDynamicBuyOpportunity(currentPrice: number): Promise<void> {
    try {
      const dropPercent = botConfig.GRID_SPACING_PERCENT;

      // First buy - create position 1 at current price
      if (this.positionsCreated === 0) {
        logger.info(`Dynamic mode: First buy at ${currentPrice}`, {
          dropPercent,
          maxPositions: botConfig.MAX_POSITIONS,
        });
        await this.createAndBuyPosition(currentPrice);
        this.lastBuyPrice = currentPrice;
        return;
      }

      // Subsequent buys - check if price dropped enough from last buy
      const dropThreshold = this.lastBuyPrice * (1 - dropPercent / 100);
      
      logger.debug(`Dynamic mode: Checking drop`, {
        currentPrice,
        lastBuyPrice: this.lastBuyPrice,
        dropThreshold,
        dropPercent,
        positionsCreated: this.positionsCreated,
        maxPositions: botConfig.MAX_POSITIONS,
      });

      if (currentPrice <= dropThreshold && this.positionsCreated < botConfig.MAX_POSITIONS) {
        logger.info(`Dynamic mode: Price dropped ${dropPercent}% from ${this.lastBuyPrice} to ${currentPrice}, creating position ${this.positionsCreated + 1}`);
        await this.createAndBuyPosition(currentPrice);
        this.lastBuyPrice = currentPrice;
      }
    } catch (error) {
      logger.error('Error in dynamic buy check:', error);
    }
  }

  /**
   * Dynamic mode: Create a new position and execute buy
   */
  private async createAndBuyPosition(currentPrice: number): Promise<void> {
    const id = (this.positionsCreated + 1).toString();
    const profitPercent = botConfig.PROFIT_THRESHOLD_PERCENT;
    const stoplossPercent = Math.abs(botConfig.STOPLOSS_PERCENTAGE);
    
    const sellMin = currentPrice * (1 + profitPercent / 100);
    const stoploss = currentPrice * (1 - stoplossPercent / 100);

    const position: Position = {
      id,
      balance: 0,
      cost: 0,
      buyMin: currentPrice * 0.99, // Bought at current
      buyMax: currentPrice * 1.01,
      sellMin,
      stoploss,
      tokenAddress: tokenConfig.wethAddress,
      symbol: 'WETH',
      createdAt: Date.now(),
    };

    // Save position first
    this.positions = await savePosition(this.positions, position);
    
    // Execute the buy
    await this.executeBuy(position, currentPrice);
    
    // Update tracking
    this.positionsCreated++;
    
    logger.info(`Dynamic mode: Created and bought position ${id} at ${currentPrice}`, {
      sellMin,
      stoploss,
      positionsCreated: this.positionsCreated,
    });
  }

  /**
   * Check a single position for sell conditions
   * Sell logic: If position has balance and current price hits sellMin or stoploss
   */
  private async checkPositionForSell(
    position: Position,
    currentPrice: number
  ): Promise<void> {
    try {
      // Only check filled positions
      if (position.balance <= 0) {
        return;
      }

      const costBasis = position.cost;
      const profitPercent = costBasis > 0 ? ((currentPrice - costBasis) / costBasis) * 100 : 0;

      logger.debug(`Checking sell for position ${position.id}`, {
        currentPrice,
        costBasis,
        profitPercent: profitPercent.toFixed(2) + '%',
        sellMin: position.sellMin,
        stoploss: position.stoploss,
      });

      // Check stop loss first (highest priority)
      if (botConfig.STOPLOSS_ACTIVE && currentPrice <= position.stoploss) {
        logger.warn(`STOP LOSS triggered for position ${position.id}!`, {
          currentPrice,
          stoploss: position.stoploss,
          loss: profitPercent.toFixed(2) + '%',
        });
        await this.executeStopLoss(position);
        return;
      }

      // Check profit target
      if (botConfig.SELLS_ACTIVE && currentPrice >= position.sellMin) {
        logger.info(`Profit target reached for position ${position.id}!`, {
          currentPrice,
          target: position.sellMin,
          profit: profitPercent.toFixed(2) + '%',
        });
        await this.executeSell(position, currentPrice);
      }
    } catch (error) {
      logger.error(`Error checking sell for position ${position.id}:`, error);
    }
  }

  /**
   * Calculate buy amount based on configured mode
   * 
   * Static Mode: Use fixed GRID_SIZE_USD for every buy
   * Dynamic Mode: Calculate buy amount based on available balance divided by empty positions
   * 
   * @returns The calculated buy amount in base units (wei), or null if calculation fails
   */
  private async calculateBuyAmount(): Promise<bigint | null> {
    logger.info(`[BUY AMOUNT] Calculating buy amount using ${botConfig.BUY_AMOUNT_MODE} mode`);

    // Static Mode: Use fixed GRID_SIZE_USD
    if (botConfig.BUY_AMOUNT_MODE === 'static') {
      const buyAmountUsd = BigInt(Math.floor(botConfig.GRID_SIZE_USD * Math.pow(10, 18)));
      logger.info(`[BUY AMOUNT] Static mode: Using fixed GRID_SIZE_USD`, {
        gridSizeUsd: botConfig.GRID_SIZE_USD,
        buyAmountUsd: buyAmountUsd.toString(),
        buyAmountFormatted: (Number(buyAmountUsd) / Math.pow(10, 18)).toFixed(6),
      });
      return buyAmountUsd;
    }

    // Dynamic Mode: Calculate based on available balance
    if (botConfig.BUY_AMOUNT_MODE === 'dynamic') {
      try {
        // 1. Get wallet balance (USDG)
        const balance = await getTokenBalance(
          tokenConfig.usdgAddress,
          this.account.address
        );
        logger.info(`[BUY AMOUNT] Dynamic mode: Retrieved wallet balance`, {
          address: this.account.address,
          rawBalance: balance.balance.toString(),
          formattedBalance: balance.formattedBalance,
          decimals: balance.decimals,
        });

        // 2. Subtract gas reserve (convert ETH to USDG equivalent, assuming 1:1 for simplicity)
        // Note: USDG has 18 decimals like ETH
        const gasReserve = BigInt(Math.floor(botConfig.GAS_RESERVE_ETH * Math.pow(10, 18)));
        const usableBalance = balance.balance - gasReserve;

        logger.info(`[BUY AMOUNT] Dynamic mode: Gas reserve calculation`, {
          gasReserveEth: botConfig.GAS_RESERVE_ETH,
          gasReserveWei: gasReserve.toString(),
          rawBalance: balance.balance.toString(),
          usableBalance: usableBalance.toString(),
          usableBalanceFormatted: (Number(usableBalance) / Math.pow(10, 18)).toFixed(6),
        });

        // Check if usable balance is positive
        if (usableBalance <= 0n) {
          logger.warn(`[BUY AMOUNT] Dynamic mode: Insufficient balance after gas reserve`, {
            balance: balance.balance.toString(),
            gasReserve: gasReserve.toString(),
            usableBalance: usableBalance.toString(),
          });
          return null;
        }

        // 3. Get number of empty positions remaining
        const emptyPositions = getEmptyPositions(this.positions);
        const emptyPositionCount = emptyPositions.length;

        logger.info(`[BUY AMOUNT] Dynamic mode: Position analysis`, {
          totalPositions: Object.keys(this.positions).length,
          filledPositions: getFilledPositions(this.positions).length,
          emptyPositions: emptyPositionCount,
          emptyPositionIds: emptyPositions.map(p => p.id),
        });

        // Check if there are any empty positions
        if (emptyPositionCount === 0) {
          logger.warn(`[BUY AMOUNT] Dynamic mode: No empty positions available for buy`);
          return null;
        }

        // 4. Calculate buy amount per position
        const buyAmountUsd = usableBalance / BigInt(emptyPositionCount);

        logger.info(`[BUY AMOUNT] Dynamic mode: Initial calculation`, {
          usableBalance: usableBalance.toString(),
          emptyPositionCount,
          buyAmountUsd: buyAmountUsd.toString(),
          buyAmountFormatted: (Number(buyAmountUsd) / Math.pow(10, 18)).toFixed(6),
        });

        // 5. Round to avoid decimals (round down to nearest 1e6 for precision)
        const roundingFactor = BigInt(Math.pow(10, 6));
        const roundedBuyAmount = (buyAmountUsd / roundingFactor) * roundingFactor;

        logger.info(`[BUY AMOUNT] Dynamic mode: Rounding applied`, {
          unrounded: buyAmountUsd.toString(),
          roundingFactor: roundingFactor.toString(),
          rounded: roundedBuyAmount.toString(),
          roundedFormatted: (Number(roundedBuyAmount) / Math.pow(10, 18)).toFixed(6),
          roundingLoss: (buyAmountUsd - roundedBuyAmount).toString(),
        });

        // Final validation
        if (roundedBuyAmount <= 0n) {
          logger.warn(`[BUY AMOUNT] Dynamic mode: Calculated amount is zero or negative`, {
            usableBalance: usableBalance.toString(),
            emptyPositionCount,
            calculatedAmount: buyAmountUsd.toString(),
          });
          return null;
        }

        logger.info(`[BUY AMOUNT] Dynamic mode: Final calculated amount`, {
          buyAmountUsd: roundedBuyAmount.toString(),
          buyAmountFormatted: (Number(roundedBuyAmount) / Math.pow(10, 18)).toFixed(6),
          perPositionUsd: (Number(roundedBuyAmount) / Math.pow(10, 18)).toFixed(6),
          totalPositions: emptyPositionCount,
          totalAllocation: (Number(roundedBuyAmount) * emptyPositionCount / Math.pow(10, 18)).toFixed(6),
        });

        return roundedBuyAmount;
      } catch (error) {
        logger.error(`[BUY AMOUNT] Dynamic mode: Error calculating buy amount`, {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }

    // Fallback (should never reach here due to type safety)
    logger.error(`[BUY AMOUNT] Unknown buy amount mode: ${botConfig.BUY_AMOUNT_MODE}`);
    return null;
  }

  /**
   * Execute buy into a specific position
   */
  private async executeBuy(position: Position, currentPrice: number): Promise<void> {
    const symbol = position.symbol || 'WETH';
    const tokenAddress = position.tokenAddress || tokenConfig.wethAddress;

    // Calculate buy amount based on configured mode
    const buyAmountUsd = await this.calculateBuyAmount();

    if (buyAmountUsd === null) {
      logger.warn(`[BUY EXECUTE] Buy skipped for position ${position.id}: Could not calculate buy amount`);
      return;
    }

    logger.info(`[BUY EXECUTE] Executing buy for position ${position.id}`, {
      positionId: position.id,
      mode: botConfig.BUY_AMOUNT_MODE,
      buyAmountUsd: buyAmountUsd.toString(),
      buyAmountFormatted: (Number(buyAmountUsd) / Math.pow(10, 18)).toFixed(6),
      currentPrice,
    });

    const result = await this.swapUsdToToken(tokenAddress, buyAmountUsd);

    if (result.success && result.buyAmount) {
      // Update position with new balance and cost
      const buyAmountNum = Number(result.buyAmount) / Math.pow(10, 18); // Assuming 18 decimals
      const updatedPosition: Position = {
        ...position,
        balance: buyAmountNum,
        cost: currentPrice,
        lastBuyAt: Date.now(),
      };

      this.positions = await savePosition(this.positions, updatedPosition);

      logTrade('BUY', symbol, {
        positionId: position.id,
        amount: buyAmountNum,
        cost: currentPrice,
        txHash: result.txHash,
        mode: botConfig.BUY_AMOUNT_MODE,
        buyAmountUsd: (Number(buyAmountUsd) / Math.pow(10, 18)).toFixed(6),
      });

      logger.info(`[BUY EXECUTE] Buy successful for position ${position.id}`, {
        positionId: position.id,
        txHash: result.txHash,
        mode: botConfig.BUY_AMOUNT_MODE,
        buyAmountUsd: (Number(buyAmountUsd) / Math.pow(10, 18)).toFixed(6),
        tokensReceived: buyAmountNum,
        costBasis: currentPrice,
      });
    } else {
      logger.error(`[BUY EXECUTE] Buy failed for position ${position.id}`, {
        positionId: position.id,
        mode: botConfig.BUY_AMOUNT_MODE,
        error: result.error,
      });
    }
  }

  /**
   * Execute stop loss sell for a specific position
   * Validates quote output is reasonable before executing (no extreme slippage)
   */
  private async executeStopLoss(position: Position): Promise<void> {
    const symbol = position.symbol || 'WETH';
    const tokenAddress = position.tokenAddress || tokenConfig.wethAddress;

    // Calculate token amount to sell based on position balance
    const tokenDecimals = 18; // Assuming 18 decimals
    const sellAmount = BigInt(Math.floor(position.balance * Math.pow(10, tokenDecimals)));

    if (sellAmount <= 0n) {
      logger.warn(`[STOPLOSS CHECK] No balance to sell for position ${position.id}`);
      return;
    }

    // ============================================================================
    // STOPLOSS VALIDATION: Get quote first to verify reasonable output
    // ============================================================================
    logger.info(`[STOPLOSS CHECK] Getting stoploss quote for position ${position.id}`, {
      positionId: position.id,
      costBasis: position.cost,
      balance: position.balance,
      sellAmount: Number(sellAmount) / Math.pow(10, tokenDecimals),
      stoplossPrice: position.stoploss,
    });

    // 1. Get quote first (before executing swap)
    const quote = await getQuote(
      tokenAddress,
      tokenConfig.usdgAddress,
      sellAmount.toString(),
      undefined,
      this.account.address
    );

    if (!quote) {
      logger.error(`[STOPLOSS CHECK] Failed to get quote for position ${position.id}, skipping stoploss`);
      return;
    }

    // 2. Calculate expected output based on stoploss price
    // For stoploss, we expect at least 85% of theoretical value (allows for reasonable slippage)
    const theoreticalValueUsd = position.stoploss * position.balance;
    const quoteOutputUsd = Number(quote.buyAmount) / Math.pow(10, tokenDecimals);
    const minAcceptableOutput = theoreticalValueUsd * 0.85; // 85% of stoploss value
    const maxAllowedSlippagePercent = 15;

    // 3. Log detailed comparison
    logger.info(`[STOPLOSS CHECK] Stoploss quote analysis for position ${position.id}:`, {
      positionId: position.id,
      costBasis: position.cost,
      stoplossPrice: position.stoploss,
      theoreticalValueUsd,
      quoteOutputUsd,
      minAcceptableOutput,
      maxAllowedSlippagePercent,
      meetsThreshold: quoteOutputUsd >= minAcceptableOutput,
      estimatedPriceImpact: quote.estimatedPriceImpact,
      grossPrice: quote.grossPrice,
      netPrice: quote.netPrice,
      lossFromCostBasis: ((quoteOutputUsd - (position.cost * position.balance)) / (position.cost * position.balance)) * 100,
    });

    // 4. Validate quote is reasonable (not extreme slippage)
    if (quoteOutputUsd < minAcceptableOutput) {
      logger.warn(`[STOPLOSS CHECK] Stoploss VALIDATION WARNING for position ${position.id}: High slippage detected`, {
        positionId: position.id,
        quoteOutputUsd,
        minAcceptableOutput,
        shortfall: minAcceptableOutput - quoteOutputUsd,
        shortfallPercent: ((minAcceptableOutput - quoteOutputUsd) / minAcceptableOutput) * 100,
        reason: 'Quote output is significantly below stoploss price (possible high slippage)',
      });
      // Note: For stoploss, we may still want to execute to prevent further losses,
      // but we log a strong warning. The bot operator can decide to block here if needed.
      // For now, we proceed but with clear warning.
    }

    logger.info(`[STOPLOSS CHECK] Stoploss EXECUTING for position ${position.id}`, {
      positionId: position.id,
      quoteOutputUsd,
      theoreticalValueUsd,
      slippagePercent: ((theoreticalValueUsd - quoteOutputUsd) / theoreticalValueUsd) * 100,
    });

    // ============================================================================
    // Execute the stoploss
    // ============================================================================
    const result = await executeSwap(quote, this.account);

    if (result.success) {
      // Reset position to empty state
      const updatedPosition: Position = {
        ...position,
        balance: 0,
        cost: 0,
        lastBuyAt: undefined,
      };

      this.positions = await savePosition(this.positions, updatedPosition);

      logTrade('STOPLOSS', symbol, {
        positionId: position.id,
        balance: position.balance,
        cost: position.cost,
        quoteOutputUsd,
        theoreticalValueUsd,
        slippagePercent: ((theoreticalValueUsd - quoteOutputUsd) / theoreticalValueUsd) * 100,
        txHash: result.txHash,
      });

      logger.info(`[STOPLOSS CHECK] Stoploss EXECUTED for position ${position.id}: ${result.txHash}`, {
        positionId: position.id,
        txHash: result.txHash,
        quoteOutputUsd,
        lossPercent: ((quoteOutputUsd - (position.cost * position.balance)) / (position.cost * position.balance)) * 100,
      });
    } else {
      logger.error(`[STOPLOSS CHECK] Stoploss execution FAILED for position ${position.id}: ${result.error}`, {
        positionId: position.id,
        error: result.error,
      });
    }
  }

  /**
   * Execute profit-taking sell for a specific position
   * STRICT PROFIT CHECK: Verifies quote output meets profit threshold before executing
   */
  private async executeSell(position: Position, currentPrice: number): Promise<void> {
    const symbol = position.symbol || 'WETH';
    const tokenAddress = position.tokenAddress || tokenConfig.wethAddress;

    // Calculate token amount to sell based on position balance
    const tokenDecimals = 18; // Assuming 18 decimals
    const totalBalance = BigInt(Math.floor(position.balance * Math.pow(10, tokenDecimals)));

    if (totalBalance <= 0n) {
      logger.warn(`No balance to sell for position ${position.id}`);
      return;
    }

    // Calculate sell amount (considering moonbag)
    let sellAmount = totalBalance;
    let moonbagAmount = 0n;

    if (botConfig.BANK_MOONBAG && botConfig.MOONBAG_PERCENTAGE > 0) {
      moonbagAmount = (totalBalance * BigInt(botConfig.MOONBAG_PERCENTAGE)) / 100n;
      sellAmount = totalBalance - moonbagAmount;

      logger.info(`Keeping moonbag for position ${position.id}:`, {
        percentage: botConfig.MOONBAG_PERCENTAGE,
        amount: Number(moonbagAmount) / Math.pow(10, tokenDecimals),
      });
    }

    // Check BANK_MIN_AMOUNT before proceeding with sell
    const sellAmountTokens = Number(sellAmount) / Math.pow(10, tokenDecimals);
    if (botConfig.BANK_PROFIT && sellAmountTokens < botConfig.BANK_MIN_AMOUNT) {
      logger.warn(`[BANK CHECK] Sell BLOCKED for position ${position.id}: Amount below BANK_MIN_AMOUNT`, {
        positionId: position.id,
        sellAmount: sellAmountTokens,
        bankMinAmount: botConfig.BANK_MIN_AMOUNT,
        reason: 'Sell amount is below minimum banking threshold',
      });
      return;
    }

    // ============================================================================
    // STRICT PROFIT CHECK: Get quote first before executing swap
    // ============================================================================
    logger.info(`[PROFIT CHECK] Getting sell quote for position ${position.id}`, {
      positionId: position.id,
      costBasis: position.cost,
      currentPrice,
      sellAmount: Number(sellAmount) / Math.pow(10, tokenDecimals),
      tokenDecimals,
    });

    // 1. Get quote first (before executing swap)
    const quote = await getQuote(
      tokenAddress,
      tokenConfig.usdgAddress,
      sellAmount.toString(),
      undefined,
      this.account.address
    );

    if (!quote) {
      logger.error(`[PROFIT CHECK] Failed to get quote for position ${position.id}, skipping sell`);
      return;
    }

    // 2. Calculate minimum required output for profitable sell
    // Convert cost basis to USDG (position.cost is in USD terms)
    const costBasisUsd = position.cost * (Number(sellAmount) / Math.pow(10, tokenDecimals));
    // MIN_PROFIT is the minimum acceptable profit multiplier (e.g., 1.08 = 8% minimum profit)
    // This is distinct from PROFIT_THRESHOLD_PERCENT which triggers the sell check
    const minProfitMultiplier = botConfig.MIN_PROFIT;
    const minRequiredOutput = costBasisUsd * minProfitMultiplier;

    // Quote output is in base units (18 decimals for USDG)
    const quoteOutputUsd = Number(quote.buyAmount) / Math.pow(10, tokenDecimals);

    // 3. Log detailed comparison
    logger.info(`[PROFIT CHECK] Sell quote analysis for position ${position.id}:`, {
      positionId: position.id,
      costBasis: position.cost,
      costBasisUsd,
      sellTokenAmount: Number(sellAmount) / Math.pow(10, tokenDecimals),
      quoteOutputUsd,
      minRequiredOutput,
      profitThresholdPercent: botConfig.PROFIT_THRESHOLD_PERCENT,
      minProfit: botConfig.MIN_PROFIT,
      minProfitMultiplier,
      meetsThreshold: quoteOutputUsd > minRequiredOutput,
      potentialProfitUsd: quoteOutputUsd - costBasisUsd,
      potentialProfitPercent: ((quoteOutputUsd - costBasisUsd) / costBasisUsd) * 100,
      estimatedPriceImpact: quote.estimatedPriceImpact,
      grossPrice: quote.grossPrice,
      netPrice: quote.netPrice,
      shortfall: quoteOutputUsd > minRequiredOutput ? 0 : minRequiredOutput - quoteOutputUsd,
    });

    // 4. Only execute if quote meets profit threshold
    if (quoteOutputUsd <= minRequiredOutput) {
      logger.warn(`[PROFIT CHECK] Sell BLOCKED for position ${position.id}: Quote below profit threshold`, {
        positionId: position.id,
        quoteOutputUsd,
        minRequiredOutput,
        shortfall: minRequiredOutput - quoteOutputUsd,
        shortfallPercent: ((minRequiredOutput - quoteOutputUsd) / minRequiredOutput) * 100,
        reason: 'Quote output does not meet minimum profit requirement',
      });
      return; // Skip this sell - protect against slippage and bad quotes
    }

    logger.info(`[PROFIT CHECK] Sell APPROVED for position ${position.id}: Quote meets profit threshold`, {
      positionId: position.id,
      quoteOutputUsd,
      minRequiredOutput,
      profitAboveThreshold: quoteOutputUsd - minRequiredOutput,
    });

    // ============================================================================
    // Execute the sell (only after profit check passes)
    // ============================================================================
    const result = await executeSwap(quote, this.account);

    if (result.success) {
      if (moonbagAmount > 0n) {
        // Update position with remaining moonbag
        const moonbagBalance = Number(moonbagAmount) / Math.pow(10, tokenDecimals);
        const updatedPosition: Position = {
          ...position,
          balance: moonbagBalance,
          cost: currentPrice, // Reset cost basis to current price
        };

        this.positions = await savePosition(this.positions, updatedPosition);

        logTrade('MOONBAG', symbol, {
          positionId: position.id,
          remainingBalance: moonbagBalance,
          newCostBasis: currentPrice,
        });
      } else {
        // Full sell - reset position to empty state
        const updatedPosition: Position = {
          ...position,
          balance: 0,
          cost: 0,
          lastBuyAt: undefined,
        };

        this.positions = await savePosition(this.positions, updatedPosition);
      }

      logTrade('SELL', symbol, {
        positionId: position.id,
        amount: Number(sellAmount) / Math.pow(10, tokenDecimals),
        price: currentPrice,
        costBasis: position.cost,
        actualOutputUsd: quoteOutputUsd,
        expectedOutputUsd: minRequiredOutput,
        profit: (((currentPrice - position.cost) / position.cost) * 100).toFixed(2) + '%',
        txHash: result.txHash,
      });

      logger.info(`[PROFIT CHECK] Sell EXECUTED for position ${position.id}: ${result.txHash}`, {
        positionId: position.id,
        txHash: result.txHash,
        actualOutputUsd: quoteOutputUsd,
        minRequiredOutput,
      });
    } else {
      logger.error(`[PROFIT CHECK] Sell execution FAILED for position ${position.id}: ${result.error}`, {
        positionId: position.id,
        error: result.error,
      });
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
  getPositions(): Record<string, Position> {
    return { ...this.positions };
  }

  /**
   * Get positions as array
   */
  getPositionsArray(): Position[] {
    return getPositionsArray(this.positions);
  }

  /**
   * Check if bot is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Generate and save grid positions
   * Useful for initial setup
   */
  async generateGridPositions(
    basePrice: number,
    numGrids: number,
    tokenAddress?: string,
    symbol?: string
  ): Promise<void> {
    const { generateGridPositions: generateFn } = await import('./storage.js');
    this.positions = generateFn(
      basePrice,
      botConfig.GRID_SIZE_USD,
      botConfig.GRID_SPACING_PERCENT,
      numGrids,
      tokenAddress || tokenConfig.wethAddress,
      symbol || 'WETH'
    );
    await savePositions(this.positions);
    logger.info(`Generated and saved ${numGrids} grid positions`);
  }
}
