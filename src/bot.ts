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
  getTokenPriceInWeth,
  ZeroXQuote,
} from './zeroX.js';
import {
  createAccount,
  getTokenBalance,
  executeSwap,
} from './wallet.js';

/**
 * Grid Trading Bot for Robinhood Chain
 * 
 * ARCHITECTURE (like Python bot):
 * - Quote Currency: WETH (like SOL in Python bot)
 * - Trading Token: Configured ERC20 (e.g., PONS, COMPUTE)
 * - Bank Currency: USDG
 * 
 * Buy: WETH → TRADING_TOKEN
 * Sell: TRADING_TOKEN → WETH (→ USDG if banking)
 */
export class GridBot {
  private positions: Record<string, Position> = {};
  private account = createAccount();
  private running = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastBuyPrice: number = 0;
  private positionsCreated: number = 0;

  async initialize(): Promise<void> {
    logger.info('Initializing Grid Bot...');
    logger.info('Wallet address:', { address: this.account.address });
    logger.info('Trading:', { 
      token: tokenConfig.tradingTokenSymbol, 
      quote: 'WETH',
      bank: 'USDG'
    });

    // Load or generate positions
    if (botConfig.GRID_MODE === 'dynamic') {
      this.positions = await loadPositions();
      this.positionsCreated = Object.keys(this.positions).length;
      const filled = getFilledPositions(this.positions);
      if (filled.length > 0) {
        const last = filled.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
        this.lastBuyPrice = last.cost;
      }
    } else {
      const price = await getTokenPriceInWeth(tokenConfig.tradingTokenAddress, tokenConfig.wethAddress);
      if (price) {
        this.positions = await initializePositions(
          true, price, botConfig.GRID_SIZE_USD, botConfig.GRID_SPACING_PERCENT,
          botConfig.MAX_POSITIONS, tokenConfig.tradingTokenAddress, tokenConfig.tradingTokenSymbol
        );
      }
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    logger.info('Starting Grid Bot...');
    await this.checkAllPositions();
    this.checkInterval = setInterval(() => {
      this.checkAllPositions().catch(e => logger.error('Check error:', e));
    }, botConfig.CHECK_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.checkInterval) clearInterval(this.checkInterval);
    logger.info('Bot stopped');
  }

  private async checkAllPositions(): Promise<void> {
    // Get WETH balance (quote currency)
    const wethBal = await getTokenBalance(tokenConfig.wethAddress, this.account.address);
    logger.debug(`WETH: ${wethBal.formattedBalance}`);

    // Get trading token price in WETH
    const price = await getTokenPriceInWeth(tokenConfig.tradingTokenAddress, tokenConfig.wethAddress);
    if (!price) {
      logger.warn('Could not get price');
      return;
    }
    logger.debug(`${tokenConfig.tradingTokenSymbol} price: ${price} WETH`);

    // Check sells
    for (const pos of getFilledPositions(this.positions)) {
      await this.checkSell(pos, price);
    }

    // Check buys
    if (botConfig.BUYS_ACTIVE && parseFloat(wethBal.formattedBalance) > 0) {
      if (botConfig.GRID_MODE === 'dynamic') {
        await this.checkDynamicBuy(price);
      } else {
        for (const pos of getEmptyPositions(this.positions)) {
          await this.checkBuy(pos, price);
        }
      }
    }

    await savePositions(this.positions);
  }

  private async checkBuy(pos: Position, price: number): Promise<void> {
    if (pos.balance !== 0) return;
    if (price >= pos.buyMin && price <= pos.buyMax) {
      logger.info(`Buy trigger: position ${pos.id} at ${price} WETH`);
      await this.executeBuy(pos, price);
    }
  }

  private async checkSell(pos: Position, price: number): Promise<void> {
    if (pos.balance <= 0) return;
    
    // Stop loss
    if (botConfig.STOPLOSS_ACTIVE && price <= pos.stoploss) {
      logger.warn(`Stop loss: position ${pos.id} at ${price} WETH`);
      await this.executeSell(pos, price, true);
      return;
    }
    
    // Profit target
    if (botConfig.SELLS_ACTIVE && price >= pos.sellMin) {
      logger.info(`Profit target: position ${pos.id} at ${price} WETH`);
      await this.executeSell(pos, price, false);
    }
  }

  private async checkDynamicBuy(price: number): Promise<void> {
    if (this.positionsCreated === 0) {
      await this.createAndBuy(price);
      this.lastBuyPrice = price;
      return;
    }
    
    const threshold = this.lastBuyPrice * (1 - botConfig.GRID_SPACING_PERCENT / 100);
    if (price <= threshold && this.positionsCreated < botConfig.MAX_POSITIONS) {
      await this.createAndBuy(price);
      this.lastBuyPrice = price;
    }
  }

  private async createAndBuy(price: number): Promise<void> {
    const id = String(++this.positionsCreated);
    const pos: Position = {
      id,
      balance: 0,
      cost: 0,
      costWeth: 0,
      buyMin: price * 0.99,
      buyMax: price * 1.01,
      sellMin: price * (1 + botConfig.PROFIT_THRESHOLD_PERCENT / 100),
      stoploss: price * (1 + botConfig.STOPLOSS_PERCENTAGE / 100),
      tokenAddress: tokenConfig.tradingTokenAddress,
      symbol: tokenConfig.tradingTokenSymbol,
      createdAt: Date.now(),
      lastBuyAt: undefined,
    };
    this.positions = await savePosition(this.positions, pos);
    await this.executeBuy(pos, price);
  }

  private async executeBuy(pos: Position, price: number): Promise<void> {
    // Calculate WETH amount to spend
    let wethAmount: bigint;
    
    if (botConfig.BUY_AMOUNT_MODE === 'static') {
      // Rough USD to WETH conversion
      wethAmount = BigInt(Math.floor(botConfig.GRID_SIZE_USD / 2000 * 1e18));
    } else {
      // Dynamic: divide WETH balance by empty positions
      const bal = await getTokenBalance(tokenConfig.wethAddress, this.account.address);
      const gasReserve = BigInt(Math.floor(botConfig.GAS_RESERVE_ETH * 1e18));
      const usable = bal.balance - gasReserve;
      const empty = getEmptyPositions(this.positions).length || 1;
      wethAmount = (usable / BigInt(empty) / BigInt(1e6)) * BigInt(1e6);
    }

    if (wethAmount <= 0n) {
      logger.warn('Insufficient WETH for buy');
      return;
    }

    logger.info(`Buying ${pos.id}: ${Number(wethAmount) / 1e18} WETH → ${tokenConfig.tradingTokenSymbol}`);

    // Get quote: WETH → Trading Token
    const quote = await getQuote(
      tokenConfig.wethAddress,
      tokenConfig.tradingTokenAddress,
      wethAmount.toString(),
      undefined,
      this.account.address
    );

    if (!quote) {
      logger.error('Failed to get buy quote');
      return;
    }

    const result = await executeSwap(quote, this.account);

    if (result.success && result.buyAmount) {
      const tokens = Number(result.buyAmount) / 1e18;
      const updated: Position = { ...pos, balance: tokens, costWeth: price, cost: price, lastBuyAt: Date.now() };
      this.positions = await savePosition(this.positions, updated);
      logTrade('BUY', pos.symbol || tokenConfig.tradingTokenSymbol, {
        positionId: pos.id, amount: tokens, costWeth: price, txHash: result.txHash
      });
      logger.info(`Buy success: ${result.txHash}`);
    } else {
      logger.error(`Buy failed: ${result.error}`);
    }
  }

  private async executeSell(pos: Position, price: number, isStoploss: boolean): Promise<void> {
    const tokenDecimals = 18;
    const totalBal = BigInt(Math.floor(pos.balance * 10 ** tokenDecimals));
    
    // Apply moonbag
    let sellAmount = totalBal;
    let moonbag = 0n;
    if (!isStoploss && botConfig.BANK_MOONBAG && botConfig.MOONBAG_PERCENTAGE > 0) {
      moonbag = (totalBal * BigInt(botConfig.MOONBAG_PERCENTAGE)) / 100n;
      sellAmount = totalBal - moonbag;
    }

    if (sellAmount <= 0n) return;

    // Get quote: Trading Token → WETH
    const quote = await getQuote(
      tokenConfig.tradingTokenAddress,
      tokenConfig.wethAddress,
      sellAmount.toString(),
      undefined,
      this.account.address
    );

    if (!quote) {
      logger.error('Failed to get sell quote');
      return;
    }

    // Profit check (not for stoploss)
    const wethOut = Number(quote.buyAmount) / 1e18;
    const tokensSold = Number(sellAmount) / 1e18;
    const costTotal = pos.costWeth * tokensSold;
    const minRequired = costTotal * botConfig.MIN_PROFIT;

    if (!isStoploss && wethOut <= minRequired) {
      logger.warn(`Sell blocked: quote ${wethOut} WETH < required ${minRequired} WETH`);
      return;
    }

    logger.info(`Selling ${pos.id}: ${tokensSold} ${pos.symbol} → ${wethOut} WETH`);

    const result = await executeSwap(quote, this.account);

    if (result.success) {
      // Calculate profit using costWeth
      const costTotal = pos.costWeth * tokensSold;
      const profitWeth = wethOut - costTotal;
      
      // Bank profit if enabled and profitable
      if (!isStoploss && botConfig.BANK_PROFIT && profitWeth > 0) {
        const bankAmount = BigInt(Math.floor(profitWeth * 1e18));
        if (bankAmount > BigInt(Math.floor(botConfig.BANK_MIN_AMOUNT * 1e18))) {
          const bankQuote = await getQuote(
            tokenConfig.wethAddress,
            tokenConfig.usdgAddress,
            bankAmount.toString(),
            undefined,
            this.account.address
          );
          if (bankQuote) {
            await executeSwap(bankQuote, this.account);
            logger.info(`Banked ${profitWeth} WETH profit as USDG`);
          }
        }
      }

      // Update position
      let updated: Position;
      if (moonbag > 0n) {
        updated = { ...pos, balance: Number(moonbag) / 1e18, costWeth: price, cost: price };
      } else {
        updated = { ...pos, balance: 0, costWeth: 0, cost: 0 };
      }
      this.positions = await savePosition(this.positions, updated);

      logTrade(isStoploss ? 'STOPLOSS' : 'SELL', pos.symbol || tokenConfig.tradingTokenSymbol, {
        positionId: pos.id, amount: tokensSold, price, profitWeth, txHash: result.txHash
      });
      
      logger.info(`${isStoploss ? 'Stoploss' : 'Sell'} success: ${result.txHash}`);
    } else {
      logger.error(`Sell failed: ${result.error}`);
    }
  }

  getPositions(): Record<string, Position> {
    return { ...this.positions };
  }

  isRunning(): boolean {
    return this.running;
  }
}
