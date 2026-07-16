"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GridBot = void 0;
const config_js_1 = require("./config.js");
const logger_js_1 = require("./logger.js");
const storage_js_1 = require("./storage.js");
const zeroX_js_1 = require("./zeroX.js");
const wallet_js_1 = require("./wallet.js");
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
class GridBot {
    positions = {};
    account = (0, wallet_js_1.createAccount)();
    running = false;
    checkInterval = null;
    lastBuyPrice = 0;
    positionsCreated = 0;
    async initialize() {
        logger_js_1.logger.info('Initializing Grid Bot...');
        logger_js_1.logger.info('Wallet address:', { address: this.account.address });
        logger_js_1.logger.info('Trading:', {
            token: config_js_1.tokenConfig.tradingTokenSymbol,
            quote: 'WETH',
            bank: 'USDG'
        });
        // Load or generate positions
        if (config_js_1.botConfig.GRID_MODE === 'dynamic') {
            this.positions = await (0, storage_js_1.loadPositions)();
            this.positionsCreated = Object.keys(this.positions).length;
            const filled = (0, storage_js_1.getFilledPositions)(this.positions);
            if (filled.length > 0) {
                const last = filled.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
                this.lastBuyPrice = last.cost;
            }
        }
        else {
            const price = await (0, zeroX_js_1.getTokenPriceInWeth)(config_js_1.tokenConfig.tradingTokenAddress, config_js_1.tokenConfig.wethAddress);
            if (price) {
                this.positions = await (0, storage_js_1.initializePositions)(true, price, config_js_1.botConfig.GRID_SIZE_USD, config_js_1.botConfig.GRID_SPACING_PERCENT, config_js_1.botConfig.MAX_POSITIONS, config_js_1.tokenConfig.tradingTokenAddress, config_js_1.tokenConfig.tradingTokenSymbol);
            }
        }
    }
    async start() {
        if (this.running)
            return;
        this.running = true;
        logger_js_1.logger.info('Starting Grid Bot...');
        await this.checkAllPositions();
        this.checkInterval = setInterval(() => {
            this.checkAllPositions().catch(e => logger_js_1.logger.error('Check error:', e));
        }, config_js_1.botConfig.CHECK_INTERVAL_MS);
    }
    async stop() {
        this.running = false;
        if (this.checkInterval)
            clearInterval(this.checkInterval);
        logger_js_1.logger.info('Bot stopped');
    }
    async checkAllPositions() {
        const timestamp = new Date().toISOString();
        // Get balances
        const wethBal = await (0, wallet_js_1.getTokenBalance)(config_js_1.tokenConfig.wethAddress, this.account.address);
        const tokenBal = await (0, wallet_js_1.getTokenBalance)(config_js_1.tokenConfig.tradingTokenAddress, this.account.address);
        // Get trading token price in WETH
        const price = await (0, zeroX_js_1.getTokenPriceInWeth)(config_js_1.tokenConfig.tradingTokenAddress, config_js_1.tokenConfig.wethAddress);
        if (!price) {
            logger_js_1.logger.warn(`[${timestamp}] Could not get price`);
            return;
        }
        // Get position stats
        const filled = (0, storage_js_1.getFilledPositions)(this.positions);
        const empty = (0, storage_js_1.getEmptyPositions)(this.positions);
        const totalPositions = Object.keys(this.positions).length;
        // Calculate position value in WETH
        const positionValueWeth = filled.reduce((sum, pos) => sum + (pos.balance * price), 0);
        const wethBalance = parseFloat(wethBal.formattedBalance);
        const totalValueWeth = wethBalance + positionValueWeth;
        // VERBOSE ROUND SUMMARY (like original Python bot)
        logger_js_1.logger.info(`\n═══════════════════════════════════════════════════════════`);
        logger_js_1.logger.info(`[${timestamp}] ROUND SUMMARY`);
        logger_js_1.logger.info(`═══════════════════════════════════════════════════════════`);
        logger_js_1.logger.info(`💰 BALANCES:`);
        logger_js_1.logger.info(`   WETH:        ${wethBalance.toFixed(6)} WETH`);
        logger_js_1.logger.info(`   ${config_js_1.tokenConfig.tradingTokenSymbol}:        ${parseFloat(tokenBal.formattedBalance).toFixed(6)} tokens`);
        logger_js_1.logger.info(`📊 PRICE:       1 ${config_js_1.tokenConfig.tradingTokenSymbol} = ${price.toFixed(8)} WETH`);
        logger_js_1.logger.info(`📈 POSITIONS:   ${filled.length}/${totalPositions} filled | ${empty.length} empty`);
        logger_js_1.logger.info(`💵 TOTAL VALUE: ${totalValueWeth.toFixed(6)} WETH`);
        if (filled.length > 0) {
            logger_js_1.logger.info(`🎯 POSITION DETAILS:`);
            for (const pos of filled) {
                const value = pos.balance * price;
                const pnl = ((price - pos.costWeth) / pos.costWeth) * 100;
                logger_js_1.logger.info(`   #${pos.id}: ${pos.balance.toFixed(4)} ${pos.symbol} @ ${pos.costWeth.toFixed(8)} | Value: ${value.toFixed(6)} WETH | PnL: ${pnl.toFixed(2)}%`);
            }
        }
        if (config_js_1.botConfig.GRID_MODE === 'dynamic' && this.lastBuyPrice > 0) {
            const nextBuyThreshold = this.lastBuyPrice * (1 - config_js_1.botConfig.GRID_SPACING_PERCENT / 100);
            logger_js_1.logger.info(`📉 NEXT BUY:    When price drops to ${nextBuyThreshold.toFixed(8)} WETH (${config_js_1.botConfig.GRID_SPACING_PERCENT}% below last buy)`);
        }
        logger_js_1.logger.info(`═══════════════════════════════════════════════════════════\n`);
        // Check sells first
        if (config_js_1.botConfig.SELLS_ACTIVE && filled.length > 0) {
            logger_js_1.logger.info(`🔍 Checking ${filled.length} filled positions for sell signals...`);
            for (const pos of filled) {
                await this.checkSell(pos, price);
            }
        }
        // Check buys
        if (config_js_1.botConfig.BUYS_ACTIVE && wethBalance > 0) {
            if (config_js_1.botConfig.GRID_MODE === 'dynamic') {
                logger_js_1.logger.info(`🔍 Checking for dynamic buy opportunity...`);
                await this.checkDynamicBuy(price);
            }
            else if (empty.length > 0) {
                logger_js_1.logger.info(`🔍 Checking ${empty.length} empty positions for buy signals...`);
                for (const pos of empty) {
                    await this.checkBuy(pos, price);
                }
            }
        }
        else if (config_js_1.botConfig.BUYS_ACTIVE && wethBalance <= 0) {
            logger_js_1.logger.warn(`⚠️  No WETH balance available for buys`);
        }
        await (0, storage_js_1.savePositions)(this.positions);
        logger_js_1.logger.info(`✅ Round complete. Waiting ${config_js_1.botConfig.CHECK_INTERVAL_MS / 1000}s...\n`);
    }
    async checkBuy(pos, price) {
        if (pos.balance !== 0)
            return;
        if (price >= pos.buyMin && price <= pos.buyMax) {
            logger_js_1.logger.info(`Buy trigger: position ${pos.id} at ${price} WETH`);
            await this.executeBuy(pos, price);
        }
    }
    async checkSell(pos, price) {
        if (pos.balance <= 0)
            return;
        // Stop loss
        if (config_js_1.botConfig.STOPLOSS_ACTIVE && price <= pos.stoploss) {
            logger_js_1.logger.warn(`Stop loss: position ${pos.id} at ${price} WETH`);
            await this.executeSell(pos, price, true);
            return;
        }
        // Profit target
        if (config_js_1.botConfig.SELLS_ACTIVE && price >= pos.sellMin) {
            logger_js_1.logger.info(`Profit target: position ${pos.id} at ${price} WETH`);
            await this.executeSell(pos, price, false);
        }
    }
    async checkDynamicBuy(price) {
        if (this.positionsCreated === 0) {
            await this.createAndBuy(price);
            this.lastBuyPrice = price;
            return;
        }
        const threshold = this.lastBuyPrice * (1 - config_js_1.botConfig.GRID_SPACING_PERCENT / 100);
        if (price <= threshold && this.positionsCreated < config_js_1.botConfig.MAX_POSITIONS) {
            await this.createAndBuy(price);
            this.lastBuyPrice = price;
        }
    }
    async createAndBuy(price) {
        const id = String(++this.positionsCreated);
        const pos = {
            id,
            balance: 0,
            cost: 0,
            costWeth: 0,
            buyMin: price * 0.99,
            buyMax: price * 1.01,
            sellMin: price * (1 + config_js_1.botConfig.PROFIT_THRESHOLD_PERCENT / 100),
            stoploss: price * (1 + config_js_1.botConfig.STOPLOSS_PERCENTAGE / 100),
            tokenAddress: config_js_1.tokenConfig.tradingTokenAddress,
            symbol: config_js_1.tokenConfig.tradingTokenSymbol,
            createdAt: Date.now(),
            lastBuyAt: undefined,
        };
        this.positions = await (0, storage_js_1.savePosition)(this.positions, pos);
        await this.executeBuy(pos, price);
    }
    async executeBuy(pos, price) {
        // Calculate WETH amount to spend
        let wethAmount;
        if (config_js_1.botConfig.BUY_AMOUNT_MODE === 'static') {
            // Rough USD to WETH conversion
            wethAmount = BigInt(Math.floor(config_js_1.botConfig.GRID_SIZE_USD / 2000 * 1e18));
        }
        else {
            // Dynamic: divide WETH balance by empty positions
            const bal = await (0, wallet_js_1.getTokenBalance)(config_js_1.tokenConfig.wethAddress, this.account.address);
            const gasReserve = BigInt(Math.floor(config_js_1.botConfig.GAS_RESERVE_ETH * 1e18));
            const usable = bal.balance - gasReserve;
            const empty = (0, storage_js_1.getEmptyPositions)(this.positions).length || 1;
            wethAmount = (usable / BigInt(empty) / BigInt(1e6)) * BigInt(1e6);
        }
        if (wethAmount <= 0n) {
            logger_js_1.logger.warn('Insufficient WETH for buy');
            return;
        }
        logger_js_1.logger.info(`Buying ${pos.id}: ${Number(wethAmount) / 1e18} WETH → ${config_js_1.tokenConfig.tradingTokenSymbol}`);
        // Get quote: WETH → Trading Token
        const quote = await (0, zeroX_js_1.getQuote)(config_js_1.tokenConfig.wethAddress, config_js_1.tokenConfig.tradingTokenAddress, wethAmount.toString(), undefined, this.account.address);
        if (!quote) {
            logger_js_1.logger.error('Failed to get buy quote');
            return;
        }
        const result = await (0, wallet_js_1.executeSwap)(quote, this.account);
        if (result.success && result.buyAmount) {
            const tokens = Number(result.buyAmount) / 1e18;
            const updated = { ...pos, balance: tokens, costWeth: price, cost: price, lastBuyAt: Date.now() };
            this.positions = await (0, storage_js_1.savePosition)(this.positions, updated);
            (0, logger_js_1.logTrade)('BUY', pos.symbol || config_js_1.tokenConfig.tradingTokenSymbol, {
                positionId: pos.id, amount: tokens, costWeth: price, txHash: result.txHash
            });
            logger_js_1.logger.info(`Buy success: ${result.txHash}`);
        }
        else {
            logger_js_1.logger.error(`Buy failed: ${result.error}`);
        }
    }
    async executeSell(pos, price, isStoploss) {
        const tokenDecimals = 18;
        const totalBal = BigInt(Math.floor(pos.balance * 10 ** tokenDecimals));
        // Apply moonbag
        let sellAmount = totalBal;
        let moonbag = 0n;
        if (!isStoploss && config_js_1.botConfig.BANK_MOONBAG && config_js_1.botConfig.MOONBAG_PERCENTAGE > 0) {
            moonbag = (totalBal * BigInt(config_js_1.botConfig.MOONBAG_PERCENTAGE)) / 100n;
            sellAmount = totalBal - moonbag;
        }
        if (sellAmount <= 0n)
            return;
        // Get quote: Trading Token → WETH
        const quote = await (0, zeroX_js_1.getQuote)(config_js_1.tokenConfig.tradingTokenAddress, config_js_1.tokenConfig.wethAddress, sellAmount.toString(), undefined, this.account.address);
        if (!quote) {
            logger_js_1.logger.error('Failed to get sell quote');
            return;
        }
        // Profit check (not for stoploss)
        const wethOut = Number(quote.buyAmount) / 1e18;
        const tokensSold = Number(sellAmount) / 1e18;
        const costTotal = pos.costWeth * tokensSold;
        const minRequired = costTotal * config_js_1.botConfig.MIN_PROFIT;
        if (!isStoploss && wethOut <= minRequired) {
            logger_js_1.logger.warn(`Sell blocked: quote ${wethOut} WETH < required ${minRequired} WETH`);
            return;
        }
        logger_js_1.logger.info(`Selling ${pos.id}: ${tokensSold} ${pos.symbol} → ${wethOut} WETH`);
        const result = await (0, wallet_js_1.executeSwap)(quote, this.account);
        if (result.success) {
            // Calculate profit using costWeth
            const costTotal = pos.costWeth * tokensSold;
            const profitWeth = wethOut - costTotal;
            // Bank profit if enabled and profitable
            if (!isStoploss && config_js_1.botConfig.BANK_PROFIT && profitWeth > 0) {
                const bankAmount = BigInt(Math.floor(profitWeth * 1e18));
                if (bankAmount > BigInt(Math.floor(config_js_1.botConfig.BANK_MIN_AMOUNT * 1e18))) {
                    const bankQuote = await (0, zeroX_js_1.getQuote)(config_js_1.tokenConfig.wethAddress, config_js_1.tokenConfig.usdgAddress, bankAmount.toString(), undefined, this.account.address);
                    if (bankQuote) {
                        await (0, wallet_js_1.executeSwap)(bankQuote, this.account);
                        logger_js_1.logger.info(`Banked ${profitWeth} WETH profit as USDG`);
                    }
                }
            }
            // Update position
            let updated;
            if (moonbag > 0n) {
                updated = { ...pos, balance: Number(moonbag) / 1e18, costWeth: price, cost: price };
            }
            else {
                updated = { ...pos, balance: 0, costWeth: 0, cost: 0 };
            }
            this.positions = await (0, storage_js_1.savePosition)(this.positions, updated);
            (0, logger_js_1.logTrade)(isStoploss ? 'STOPLOSS' : 'SELL', pos.symbol || config_js_1.tokenConfig.tradingTokenSymbol, {
                positionId: pos.id, amount: tokensSold, price, profitWeth, txHash: result.txHash
            });
            logger_js_1.logger.info(`${isStoploss ? 'Stoploss' : 'Sell'} success: ${result.txHash}`);
        }
        else {
            logger_js_1.logger.error(`Sell failed: ${result.error}`);
        }
    }
    getPositions() {
        return { ...this.positions };
    }
    isRunning() {
        return this.running;
    }
}
exports.GridBot = GridBot;
//# sourceMappingURL=bot.js.map