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
    const timestamp = new Date().toISOString();
    
    // Get balances
    const wethBal = await getTokenBalance(tokenConfig.wethAddress, this.account.address);
    const tokenBal = await getTokenBalance(tokenConfig.tradingTokenAddress, this.account.address);
    
    // Get trading token price in WETH
    const price = await getTokenPriceInWeth(tokenConfig.tradingTokenAddress, tokenConfig.wethAddress);
    if (!price) {
      logger.warn(`[${timestamp}] Could not get price`);
      return;
    }

    // Get position stats
    const filled = getFilledPositions(this.positions);
    const empty = getEmptyPositions(this.positions);
    const totalPositions = Object.keys(this.positions).length;
    
    // Calculate position value in WETH
    const positionValueWeth = filled.reduce((sum, pos) => sum + (pos.balance * price), 0);
    const wethBalance = parseFloat(wethBal.formattedBalance);
    const totalValueWeth = wethBalance + positionValueWeth;

    // VERBOSE ROUND SUMMARY (like original Python bot)
    logger.info(`\n═══════════════════════════════════════════════════════════`);
    logger.info(`[${timestamp}] ROUND SUMMARY`);
    logger.info(`═══════════════════════════════════════════════════════════`);
    logger.info(`💰 BALANCES:`);
    logger.info(`   WETH:        ${wethBalance.toFixed(6)} WETH`);
    logger.info(`   ${tokenConfig.tradingTokenSymbol}:        ${parseFloat(tokenBal.formattedBalance).toFixed(6)} tokens`);
    logger.info(`📊 PRICE:       1 ${tokenConfig.tradingTokenSymbol} = ${price.toFixed(8)} WETH`);
    logger.info(`📈 POSITIONS:   ${filled.length}/${totalPositions} filled | ${empty.length} empty`);
    logger.info(`💵 TOTAL VALUE: ${totalValueWeth.toFixed(6)} WETH`);
    
    if (filled.length > 0) {
      logger.info(`🎯 POSITION DETAILS:`);
      for (const pos of filled) {
        const value = pos.balance * price;
        const pnl = ((price - pos.costWeth) / pos.costWeth) * 100;
        logger.info(`   #${pos.id}: ${pos.balance.toFixed(4)} ${pos.symbol} @ ${pos.costWeth.toFixed(8)} | Value: ${value.toFixed(6)} WETH | PnL: ${pnl.toFixed(2)}%`);
      }
    }
    
    if (botConfig.GRID_MODE === 'dynamic' && this.lastBuyPrice > 0) {
      const nextBuyThreshold = this.lastBuyPrice * (1 - botConfig.GRID_SPACING_PERCENT / 100);
      logger.info(`📉 NEXT BUY:    When price drops to ${nextBuyThreshold.toFixed(8)} WETH (${botConfig.GRID_SPACING_PERCENT}% below last buy)`);
    }
    logger.info(`═══════════════════════════════════════════════════════════\n`);

    // Check sells first
    if (botConfig.SELLS_ACTIVE && filled.length > 0) {
      logger.info(`🔍 Checking ${filled.length} filled positions for sell signals...`);
      for (const pos of filled) {
        await this.checkSell(pos, price);
      }
    }

    // Check buys
    if (botConfig.BUYS_ACTIVE && wethBalance > 0) {
      if (botConfig.GRID_MODE === 'dynamic') {
        logger.info(`🔍 Checking for dynamic buy opportunity...`);
        await this.checkDynamicBuy(price);
      } else if (empty.length > 0) {
        logger.info(`🔍 Checking ${empty.length} empty positions for buy signals...`);
        for (const pos of empty) {
          await this.checkBuy(pos, price);
        }
      }
    } else if (botConfig.BUYS_ACTIVE && wethBalance <= 0) {
      logger.warn(`⚠️  No WETH balance available for buys`);
    }

    await savePositions(this.positions);
    logger.info(`✅ Round complete. Waiting ${botConfig.CHECK_INTERVAL_MS / 1000}s...\n`);
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
    
    // Try to execute buy first
    const success = await this.executeBuy(pos, price);
    
    if (success) {
      // Only save position and update lastBuyPrice if buy succeeded
      this.positions = await savePosition(this.positions, pos);
      this.lastBuyPrice = price;
      logger.info(`✅ Position ${id} created and filled at ${price} WETH`);
    } else {
      // Buy failed - don't save position, decrement counter
      this.positionsCreated--;
      logger.warn(`❌ Position ${id} buy failed - not saving empty position`);
    }
  }

  private async executeBuy(pos: Position, price: number): Promise<boolean> {
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
      return false;
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
      logger.error('❌ Failed to get buy quote - no liquidity or pair not supported');
      return false;
    }

    logger.info(`Quote received: ${quote.buyAmount} ${tokenConfig.tradingTokenSymbol} for ${Number(wethAmount)/1e18} WETH`);

    const result = await executeSwap(quote, this.account);

    if (result.success && result.buyAmount) {
      const tokens = Number(result.buyAmount) / 1e18;
      // Update position in place
      pos.balance = tokens;
      pos.costWeth = price;
      pos.cost = price;
      pos.lastBuyAt = Date.now();
      
      logTrade('BUY', pos.symbol || tokenConfig.tradingTokenSymbol, {
        positionId: pos.id, amount: tokens, costWeth: price, txHash: result.txHash
      });
      logger.info(`✅ Buy success: ${result.txHash}`);
      return true;
    } else {
      logger.error(`❌ Buy failed: ${result.error}`);
      logger.error(`   Tx: ${result.txHash || 'N/A'}`);
      return false;
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
