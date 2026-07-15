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
 */
class GridBot {
    positions = [];
    account = (0, wallet_js_1.createAccount)();
    running = false;
    checkInterval = null;
    /**
     * Initialize the bot
     */
    async initialize() {
        logger_js_1.logger.info('Initializing Grid Bot...');
        logger_js_1.logger.info('Wallet address:', { address: this.account.address });
        // Load existing positions
        this.positions = await (0, storage_js_1.loadPositions)();
        logger_js_1.logger.info(`Loaded ${this.positions.length} positions`);
        // Log configuration
        logger_js_1.logger.info('Bot configuration:', {
            BANK_PROFIT: config_js_1.botConfig.BANK_PROFIT,
            SELLS_ACTIVE: config_js_1.botConfig.SELLS_ACTIVE,
            BUYS_ACTIVE: config_js_1.botConfig.BUYS_ACTIVE,
            BANK_MOONBAG: config_js_1.botConfig.BANK_MOONBAG,
            STOPLOSS_ACTIVE: config_js_1.botConfig.STOPLOSS_ACTIVE,
            MAX_POSITIONS: config_js_1.botConfig.MAX_POSITIONS,
        });
    }
    /**
     * Start the bot
     */
    async start() {
        if (this.running) {
            logger_js_1.logger.warn('Bot is already running');
            return;
        }
        this.running = true;
        logger_js_1.logger.info('Starting Grid Bot...');
        // Run initial check
        await this.checkAllPositions();
        // Set up interval for regular checks
        this.checkInterval = setInterval(() => {
            this.checkAllPositions().catch((error) => {
                logger_js_1.logger.error('Error in position check:', error);
            });
        }, config_js_1.botConfig.CHECK_INTERVAL_MS);
        logger_js_1.logger.info(`Bot started. Checking every ${config_js_1.botConfig.CHECK_INTERVAL_MS}ms`);
    }
    /**
     * Stop the bot
     */
    async stop() {
        this.running = false;
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        logger_js_1.logger.info('Bot stopped');
    }
    /**
     * Check all positions and execute trades as needed
     */
    async checkAllPositions() {
        const timestamp = new Date().toISOString();
        logger_js_1.logger.debug(`=== Checking positions at ${timestamp} ===`);
        // Get current USDG balance for potential buys
        const usdgBalance = await (0, wallet_js_1.getTokenBalance)(config_js_1.tokenConfig.usdgAddress, this.account.address);
        logger_js_1.logger.debug(`USDG Balance: ${usdgBalance.formattedBalance}`);
        // Check existing positions for sells/stoploss
        for (let i = this.positions.length - 1; i >= 0; i--) {
            const position = this.positions[i];
            await this.checkPositionForSell(position, i);
        }
        // Check for new buy opportunities if we have capacity and USDG
        if (config_js_1.botConfig.BUYS_ACTIVE &&
            this.positions.length < config_js_1.botConfig.MAX_POSITIONS &&
            parseFloat(usdgBalance.formattedBalance) >= config_js_1.botConfig.GRID_SIZE_USD) {
            await this.checkForBuyOpportunities();
        }
        // Save positions after all checks
        await (0, storage_js_1.savePositions)(this.positions);
    }
    /**
     * Check a single position for sell conditions
     */
    async checkPositionForSell(position, index) {
        try {
            // Get current price
            const currentPrice = await (0, zeroX_js_1.getTokenPriceInUsd)(position.tokenAddress, config_js_1.tokenConfig.wethAddress);
            if (currentPrice === null) {
                logger_js_1.logger.warn(`Could not get price for ${position.symbol}`);
                return;
            }
            const costBasis = parseFloat(position.cost);
            const profitPercent = ((currentPrice - costBasis) / costBasis) * 100;
            const stoplossPrice = parseFloat(position.stoploss);
            const sellMinPrice = parseFloat(position.sellMin);
            logger_js_1.logger.debug(`Position check: ${position.symbol}`, {
                currentPrice,
                costBasis,
                profitPercent,
                stoplossPrice,
                sellMinPrice,
            });
            // Check stop loss first
            if (config_js_1.botConfig.STOPLOSS_ACTIVE && currentPrice <= stoplossPrice) {
                logger_js_1.logger.warn(`STOP LOSS triggered for ${position.symbol}!`, {
                    currentPrice,
                    stoplossPrice,
                    loss: profitPercent.toFixed(2) + '%',
                });
                await this.executeStopLoss(position, index);
                return;
            }
            // Check profit target
            if (config_js_1.botConfig.SELLS_ACTIVE && currentPrice >= sellMinPrice) {
                logger_js_1.logger.info(`Profit target reached for ${position.symbol}!`, {
                    currentPrice,
                    target: sellMinPrice,
                    profit: profitPercent.toFixed(2) + '%',
                });
                await this.executeSell(position, index, currentPrice);
            }
        }
        catch (error) {
            logger_js_1.logger.error(`Error checking position ${position.symbol}:`, error);
        }
    }
    /**
     * Execute stop loss sell
     */
    async executeStopLoss(position, index) {
        const balance = await (0, wallet_js_1.getTokenBalance)(position.tokenAddress, this.account.address);
        if (balance.balance === 0n) {
            logger_js_1.logger.warn(`No balance to sell for ${position.symbol}`);
            await (0, storage_js_1.removePosition)(this.positions, index);
            return;
        }
        const result = await this.swapTokenToUsd(position.tokenAddress, balance.balance);
        if (result.success) {
            const { updated, removed } = await (0, storage_js_1.removePosition)(this.positions, index);
            this.positions = updated;
            (0, logger_js_1.logTrade)('STOPLOSS', position.symbol, {
                balance: balance.formattedBalance,
                cost: position.cost,
                txHash: result.txHash,
            });
            logger_js_1.logger.info(`Stop loss executed for ${position.symbol}: ${result.txHash}`);
        }
        else {
            logger_js_1.logger.error(`Stop loss failed for ${position.symbol}: ${result.error}`);
        }
    }
    /**
     * Execute profit-taking sell with optional moonbag
     */
    async executeSell(position, index, currentPrice) {
        const balance = await (0, wallet_js_1.getTokenBalance)(position.tokenAddress, this.account.address);
        if (balance.balance === 0n) {
            logger_js_1.logger.warn(`No balance to sell for ${position.symbol}`);
            await (0, storage_js_1.removePosition)(this.positions, index);
            return;
        }
        // Calculate sell amount (considering moonbag)
        let sellAmount = balance.balance;
        let moonbagAmount = 0n;
        if (config_js_1.botConfig.BANK_MOONBAG && config_js_1.botConfig.MOONBAG_PERCENTAGE > 0) {
            moonbagAmount = (balance.balance * BigInt(config_js_1.botConfig.MOONBAG_PERCENTAGE)) / 100n;
            sellAmount = balance.balance - moonbagAmount;
            logger_js_1.logger.info(`Keeping moonbag for ${position.symbol}:`, {
                percentage: config_js_1.botConfig.MOONBAG_PERCENTAGE,
                amount: (Number(moonbagAmount) / Math.pow(10, balance.decimals)).toFixed(6),
            });
        }
        // Execute the sell
        const result = await this.swapTokenToUsd(position.tokenAddress, sellAmount);
        if (result.success) {
            if (moonbagAmount > 0n) {
                // Update position with remaining moonbag
                const newCost = currentPrice.toString();
                await (0, storage_js_1.updatePosition)(this.positions, index, {
                    balance: moonbagAmount.toString(),
                    cost: newCost,
                    buyMin: (currentPrice * 0.95).toString(), // 5% below current
                    buyMax: (currentPrice * 1.05).toString(), // 5% above current
                    sellMin: (currentPrice * 1.05).toString(), // 5% profit target
                    stoploss: (currentPrice * 0.9).toString(), // 10% stop loss
                });
                (0, logger_js_1.logTrade)('MOONBAG', position.symbol, {
                    remainingBalance: (Number(moonbagAmount) / Math.pow(10, balance.decimals)).toFixed(6),
                    newCostBasis: newCost,
                });
            }
            else {
                // Full sell - remove position
                const { updated } = await (0, storage_js_1.removePosition)(this.positions, index);
                this.positions = updated;
            }
            (0, logger_js_1.logTrade)('SELL', position.symbol, {
                amount: (Number(sellAmount) / Math.pow(10, balance.decimals)).toFixed(6),
                price: currentPrice,
                profit: (((currentPrice - parseFloat(position.cost)) / parseFloat(position.cost)) * 100).toFixed(2) + '%',
                txHash: result.txHash,
            });
            logger_js_1.logger.info(`Sell executed for ${position.symbol}: ${result.txHash}`);
        }
        else {
            logger_js_1.logger.error(`Sell failed for ${position.symbol}: ${result.error}`);
        }
    }
    /**
     * Check for new buy opportunities
     */
    async checkForBuyOpportunities() {
        // For now, we'll use WETH as the primary trading token
        // In a real implementation, you might scan multiple tokens
        const targetToken = config_js_1.tokenConfig.wethAddress;
        // Check if we already have a position for this token
        if ((0, storage_js_1.getPositionByToken)(this.positions, targetToken).position !== null) {
            return;
        }
        // Get current price
        const currentPrice = await (0, zeroX_js_1.getTokenPriceInUsd)(targetToken, config_js_1.tokenConfig.wethAddress);
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
            logger_js_1.logger.info(`Buy opportunity found for WETH at ${currentPrice}`);
            await this.executeBuy(targetToken, 'WETH', currentPrice);
        }
    }
    /**
     * Execute a buy order
     */
    async executeBuy(tokenAddress, symbol, currentPrice) {
        // Convert USDG amount to base units (USDG has 18 decimals)
        const buyAmountUsd = parseFloat((config_js_1.botConfig.GRID_SIZE_USD * Math.pow(10, 18)).toFixed(0));
        const result = await this.swapUsdToToken(tokenAddress, BigInt(buyAmountUsd));
        if (result.success && result.buyAmount) {
            // Create new position
            const newPosition = {
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
            this.positions = await (0, storage_js_1.addPosition)(this.positions, newPosition);
            (0, logger_js_1.logTrade)('BUY', symbol, {
                amount: result.buyAmount,
                cost: currentPrice,
                txHash: result.txHash,
            });
            logger_js_1.logger.info(`Buy executed for ${symbol}: ${result.txHash}`);
        }
        else {
            logger_js_1.logger.error(`Buy failed for ${symbol}: ${result.error}`);
        }
    }
    /**
     * Swap USDG to token
     */
    async swapUsdToToken(tokenAddress, usdAmount) {
        const quote = await (0, zeroX_js_1.getQuote)(config_js_1.tokenConfig.usdgAddress, tokenAddress, usdAmount.toString(), undefined, this.account.address);
        if (!quote) {
            return { success: false, error: 'Failed to get quote' };
        }
        return (0, wallet_js_1.executeSwap)(quote, this.account);
    }
    /**
     * Swap token to USDG
     */
    async swapTokenToUsd(tokenAddress, tokenAmount) {
        const quote = await (0, zeroX_js_1.getQuote)(tokenAddress, config_js_1.tokenConfig.usdgAddress, tokenAmount.toString(), undefined, this.account.address);
        if (!quote) {
            return { success: false, error: 'Failed to get quote' };
        }
        return (0, wallet_js_1.executeSwap)(quote, this.account);
    }
    /**
     * Get current positions
     */
    getPositions() {
        return [...this.positions];
    }
    /**
     * Check if bot is running
     */
    isRunning() {
        return this.running;
    }
}
exports.GridBot = GridBot;
//# sourceMappingURL=bot.js.map