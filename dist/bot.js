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
 * Supports pre-generated grid positions loaded from JSON
 * Supports auto-generated grid positions at startup
 * Supports dynamic on-demand positions (DCA on drops)
 */
class GridBot {
    positions = {};
    account = (0, wallet_js_1.createAccount)();
    running = false;
    checkInterval = null;
    lastBuyPrice = 0;
    positionsCreated = 0;
    /**
     * Initialize the bot
     */
    async initialize() {
        logger_js_1.logger.info('Initializing Grid Bot...');
        logger_js_1.logger.info('Wallet address:', { address: this.account.address });
        // Log configuration
        logger_js_1.logger.info('Bot configuration:', {
            BANK_PROFIT: config_js_1.botConfig.BANK_PROFIT,
            SELLS_ACTIVE: config_js_1.botConfig.SELLS_ACTIVE,
            BUYS_ACTIVE: config_js_1.botConfig.BUYS_ACTIVE,
            BANK_MOONBAG: config_js_1.botConfig.BANK_MOONBAG,
            STOPLOSS_ACTIVE: config_js_1.botConfig.STOPLOSS_ACTIVE,
            MAX_POSITIONS: config_js_1.botConfig.MAX_POSITIONS,
            GRID_SPACING_PERCENT: config_js_1.botConfig.GRID_SPACING_PERCENT,
            GRID_MODE: config_js_1.botConfig.GRID_MODE,
        });
        // Handle different grid modes
        if (config_js_1.botConfig.GRID_MODE === 'dynamic') {
            // Dynamic mode: Start fresh, positions created on-demand
            this.positions = await (0, storage_js_1.loadPositions)();
            this.positionsCreated = Object.keys(this.positions).length;
            // Find the last buy price from existing filled positions
            const filledPositions = (0, storage_js_1.getFilledPositions)(this.positions);
            if (filledPositions.length > 0) {
                // Get the most recently created position with balance
                const lastPosition = filledPositions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
                this.lastBuyPrice = lastPosition.cost;
                logger_js_1.logger.info(`Dynamic mode: Found ${this.positionsCreated} existing positions, last buy at ${this.lastBuyPrice}`);
            }
            else {
                logger_js_1.logger.info('Dynamic mode: Starting fresh, no existing positions');
            }
        }
        else if (config_js_1.botConfig.GRID_MODE === 'autogenerate') {
            // Auto-generate mode: Generate grid positions at startup
            const currentPrice = await (0, zeroX_js_1.getTokenPriceInUsd)(config_js_1.tokenConfig.wethAddress, config_js_1.tokenConfig.wethAddress);
            if (currentPrice) {
                this.positions = await (0, storage_js_1.initializePositions)(true, currentPrice, config_js_1.botConfig.GRID_SIZE_USD, config_js_1.botConfig.GRID_SPACING_PERCENT, config_js_1.botConfig.MAX_POSITIONS, config_js_1.tokenConfig.wethAddress, 'WETH');
                logger_js_1.logger.info(`Auto-generated ${Object.keys(this.positions).length} grid positions`);
            }
            else {
                logger_js_1.logger.warn('Could not get current price for auto-generation, starting with empty positions');
                this.positions = {};
            }
        }
        else {
            // Pregenerated mode: Load positions from positions.json
            this.positions = await (0, storage_js_1.loadPositions)();
            const positionCount = Object.keys(this.positions).length;
            logger_js_1.logger.info(`Pregenerated mode: Loaded ${positionCount} positions from storage`);
        }
        // Log loaded positions summary
        const positionCount = Object.keys(this.positions).length;
        if (positionCount > 0) {
            const filledPositions = (0, storage_js_1.getFilledPositions)(this.positions);
            const emptyPositions = (0, storage_js_1.getEmptyPositions)(this.positions);
            logger_js_1.logger.info('Positions summary:', {
                total: positionCount,
                filled: filledPositions.length,
                empty: emptyPositions.length,
            });
        }
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
     * New behavior: Check ALL empty positions for buy opportunities
     * Check ALL filled positions for sell/stoploss conditions
     * Dynamic mode: Create positions on-demand when price drops
     */
    async checkAllPositions() {
        const timestamp = new Date().toISOString();
        logger_js_1.logger.debug(`=== Checking positions at ${timestamp} ===`);
        // Get current USDG balance for potential buys
        const usdgBalance = await (0, wallet_js_1.getTokenBalance)(config_js_1.tokenConfig.usdgAddress, this.account.address);
        logger_js_1.logger.debug(`USDG Balance: ${usdgBalance.formattedBalance}`);
        // Get current price for the target token (WETH)
        const currentPrice = await (0, zeroX_js_1.getTokenPriceInUsd)(config_js_1.tokenConfig.wethAddress, config_js_1.tokenConfig.wethAddress);
        if (currentPrice === null) {
            logger_js_1.logger.warn('Could not get current price, skipping check');
            return;
        }
        logger_js_1.logger.debug(`Current price: ${currentPrice}`);
        // Check ALL filled positions for sell/stoploss opportunities
        const filledPositions = (0, storage_js_1.getFilledPositions)(this.positions);
        logger_js_1.logger.debug(`Checking ${filledPositions.length} filled positions for sell conditions`);
        for (const position of filledPositions) {
            await this.checkPositionForSell(position, currentPrice);
        }
        // Handle buys based on grid mode
        if (config_js_1.botConfig.BUYS_ACTIVE && parseFloat(usdgBalance.formattedBalance) >= config_js_1.botConfig.GRID_SIZE_USD) {
            if (config_js_1.botConfig.GRID_MODE === 'dynamic') {
                // Dynamic mode: Create positions on-demand
                await this.checkDynamicBuyOpportunity(currentPrice);
            }
            else {
                // Pregenerated/Autogenerate mode: Check existing empty positions
                const emptyPositions = (0, storage_js_1.getEmptyPositions)(this.positions);
                logger_js_1.logger.debug(`Checking ${emptyPositions.length} empty positions for buy opportunities`);
                for (const position of emptyPositions) {
                    await this.checkPositionForBuy(position, currentPrice);
                }
            }
        }
        // Save positions after all checks
        await (0, storage_js_1.savePositions)(this.positions);
    }
    /**
     * Check a single position for buy conditions
     * Buy logic: If position is empty (balance=0) and current price is within buyMin-buyMax range
     */
    async checkPositionForBuy(position, currentPrice) {
        try {
            // Only check empty positions
            if (position.balance !== 0) {
                return;
            }
            logger_js_1.logger.debug(`Checking buy for position ${position.id}`, {
                currentPrice,
                buyMin: position.buyMin,
                buyMax: position.buyMax,
            });
            // Check if current price is within buy range
            if (currentPrice >= position.buyMin && currentPrice <= position.buyMax) {
                logger_js_1.logger.info(`Buy opportunity found for position ${position.id}!`, {
                    currentPrice,
                    buyMin: position.buyMin,
                    buyMax: position.buyMax,
                });
                await this.executeBuy(position, currentPrice);
            }
        }
        catch (error) {
            logger_js_1.logger.error(`Error checking buy for position ${position.id}:`, error);
        }
    }
    /**
     * Dynamic mode: Check for buy opportunities based on price drops
     * Creates new positions on-demand when price drops by GRID_SPACING_PERCENT
     */
    async checkDynamicBuyOpportunity(currentPrice) {
        try {
            const dropPercent = config_js_1.botConfig.GRID_SPACING_PERCENT;
            // First buy - create position 1 at current price
            if (this.positionsCreated === 0) {
                logger_js_1.logger.info(`Dynamic mode: First buy at ${currentPrice}`, {
                    dropPercent,
                    maxPositions: config_js_1.botConfig.MAX_POSITIONS,
                });
                await this.createAndBuyPosition(currentPrice);
                this.lastBuyPrice = currentPrice;
                return;
            }
            // Subsequent buys - check if price dropped enough from last buy
            const dropThreshold = this.lastBuyPrice * (1 - dropPercent / 100);
            logger_js_1.logger.debug(`Dynamic mode: Checking drop`, {
                currentPrice,
                lastBuyPrice: this.lastBuyPrice,
                dropThreshold,
                dropPercent,
                positionsCreated: this.positionsCreated,
                maxPositions: config_js_1.botConfig.MAX_POSITIONS,
            });
            if (currentPrice <= dropThreshold && this.positionsCreated < config_js_1.botConfig.MAX_POSITIONS) {
                logger_js_1.logger.info(`Dynamic mode: Price dropped ${dropPercent}% from ${this.lastBuyPrice} to ${currentPrice}, creating position ${this.positionsCreated + 1}`);
                await this.createAndBuyPosition(currentPrice);
                this.lastBuyPrice = currentPrice;
            }
        }
        catch (error) {
            logger_js_1.logger.error('Error in dynamic buy check:', error);
        }
    }
    /**
     * Dynamic mode: Create a new position and execute buy
     */
    async createAndBuyPosition(currentPrice) {
        const id = (this.positionsCreated + 1).toString();
        const profitPercent = config_js_1.botConfig.PROFIT_THRESHOLD_PERCENT;
        const stoplossPercent = Math.abs(config_js_1.botConfig.STOPLOSS_PERCENTAGE);
        const sellMin = currentPrice * (1 + profitPercent / 100);
        const stoploss = currentPrice * (1 - stoplossPercent / 100);
        const position = {
            id,
            balance: 0,
            cost: 0,
            buyMin: currentPrice * 0.99, // Bought at current
            buyMax: currentPrice * 1.01,
            sellMin,
            stoploss,
            tokenAddress: config_js_1.tokenConfig.wethAddress,
            symbol: 'WETH',
            createdAt: Date.now(),
        };
        // Save position first
        this.positions = await (0, storage_js_1.savePosition)(this.positions, position);
        // Execute the buy
        await this.executeBuy(position, currentPrice);
        // Update tracking
        this.positionsCreated++;
        logger_js_1.logger.info(`Dynamic mode: Created and bought position ${id} at ${currentPrice}`, {
            sellMin,
            stoploss,
            positionsCreated: this.positionsCreated,
        });
    }
    /**
     * Check a single position for sell conditions
     * Sell logic: If position has balance and current price hits sellMin or stoploss
     */
    async checkPositionForSell(position, currentPrice) {
        try {
            // Only check filled positions
            if (position.balance <= 0) {
                return;
            }
            const costBasis = position.cost;
            const profitPercent = costBasis > 0 ? ((currentPrice - costBasis) / costBasis) * 100 : 0;
            logger_js_1.logger.debug(`Checking sell for position ${position.id}`, {
                currentPrice,
                costBasis,
                profitPercent: profitPercent.toFixed(2) + '%',
                sellMin: position.sellMin,
                stoploss: position.stoploss,
            });
            // Check stop loss first (highest priority)
            if (config_js_1.botConfig.STOPLOSS_ACTIVE && currentPrice <= position.stoploss) {
                logger_js_1.logger.warn(`STOP LOSS triggered for position ${position.id}!`, {
                    currentPrice,
                    stoploss: position.stoploss,
                    loss: profitPercent.toFixed(2) + '%',
                });
                await this.executeStopLoss(position);
                return;
            }
            // Check profit target
            if (config_js_1.botConfig.SELLS_ACTIVE && currentPrice >= position.sellMin) {
                logger_js_1.logger.info(`Profit target reached for position ${position.id}!`, {
                    currentPrice,
                    target: position.sellMin,
                    profit: profitPercent.toFixed(2) + '%',
                });
                await this.executeSell(position, currentPrice);
            }
        }
        catch (error) {
            logger_js_1.logger.error(`Error checking sell for position ${position.id}:`, error);
        }
    }
    /**
     * Execute buy into a specific position
     */
    async executeBuy(position, currentPrice) {
        const symbol = position.symbol || 'WETH';
        const tokenAddress = position.tokenAddress || config_js_1.tokenConfig.wethAddress;
        // Convert USDG amount to base units (USDG has 18 decimals)
        const buyAmountUsd = BigInt(Math.floor(config_js_1.botConfig.GRID_SIZE_USD * Math.pow(10, 18)));
        const result = await this.swapUsdToToken(tokenAddress, buyAmountUsd);
        if (result.success && result.buyAmount) {
            // Update position with new balance and cost
            const buyAmountNum = Number(result.buyAmount) / Math.pow(10, 18); // Assuming 18 decimals
            const updatedPosition = {
                ...position,
                balance: buyAmountNum,
                cost: currentPrice,
                lastBuyAt: Date.now(),
            };
            this.positions = await (0, storage_js_1.savePosition)(this.positions, updatedPosition);
            (0, logger_js_1.logTrade)('BUY', symbol, {
                positionId: position.id,
                amount: buyAmountNum,
                cost: currentPrice,
                txHash: result.txHash,
            });
            logger_js_1.logger.info(`Buy executed for position ${position.id}: ${result.txHash}`);
        }
        else {
            logger_js_1.logger.error(`Buy failed for position ${position.id}: ${result.error}`);
        }
    }
    /**
     * Execute stop loss sell for a specific position
     * Validates quote output is reasonable before executing (no extreme slippage)
     */
    async executeStopLoss(position) {
        const symbol = position.symbol || 'WETH';
        const tokenAddress = position.tokenAddress || config_js_1.tokenConfig.wethAddress;
        // Calculate token amount to sell based on position balance
        const tokenDecimals = 18; // Assuming 18 decimals
        const sellAmount = BigInt(Math.floor(position.balance * Math.pow(10, tokenDecimals)));
        if (sellAmount <= 0n) {
            logger_js_1.logger.warn(`[STOPLOSS CHECK] No balance to sell for position ${position.id}`);
            return;
        }
        // ============================================================================
        // STOPLOSS VALIDATION: Get quote first to verify reasonable output
        // ============================================================================
        logger_js_1.logger.info(`[STOPLOSS CHECK] Getting stoploss quote for position ${position.id}`, {
            positionId: position.id,
            costBasis: position.cost,
            balance: position.balance,
            sellAmount: Number(sellAmount) / Math.pow(10, tokenDecimals),
            stoplossPrice: position.stoploss,
        });
        // 1. Get quote first (before executing swap)
        const quote = await (0, zeroX_js_1.getQuote)(tokenAddress, config_js_1.tokenConfig.usdgAddress, sellAmount.toString(), undefined, this.account.address);
        if (!quote) {
            logger_js_1.logger.error(`[STOPLOSS CHECK] Failed to get quote for position ${position.id}, skipping stoploss`);
            return;
        }
        // 2. Calculate expected output based on stoploss price
        // For stoploss, we expect at least 85% of theoretical value (allows for reasonable slippage)
        const theoreticalValueUsd = position.stoploss * position.balance;
        const quoteOutputUsd = Number(quote.buyAmount) / Math.pow(10, tokenDecimals);
        const minAcceptableOutput = theoreticalValueUsd * 0.85; // 85% of stoploss value
        const maxAllowedSlippagePercent = 15;
        // 3. Log detailed comparison
        logger_js_1.logger.info(`[STOPLOSS CHECK] Stoploss quote analysis for position ${position.id}:`, {
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
            logger_js_1.logger.warn(`[STOPLOSS CHECK] Stoploss VALIDATION WARNING for position ${position.id}: High slippage detected`, {
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
        logger_js_1.logger.info(`[STOPLOSS CHECK] Stoploss EXECUTING for position ${position.id}`, {
            positionId: position.id,
            quoteOutputUsd,
            theoreticalValueUsd,
            slippagePercent: ((theoreticalValueUsd - quoteOutputUsd) / theoreticalValueUsd) * 100,
        });
        // ============================================================================
        // Execute the stoploss
        // ============================================================================
        const result = await (0, wallet_js_1.executeSwap)(quote, this.account);
        if (result.success) {
            // Reset position to empty state
            const updatedPosition = {
                ...position,
                balance: 0,
                cost: 0,
                lastBuyAt: undefined,
            };
            this.positions = await (0, storage_js_1.savePosition)(this.positions, updatedPosition);
            (0, logger_js_1.logTrade)('STOPLOSS', symbol, {
                positionId: position.id,
                balance: position.balance,
                cost: position.cost,
                quoteOutputUsd,
                theoreticalValueUsd,
                slippagePercent: ((theoreticalValueUsd - quoteOutputUsd) / theoreticalValueUsd) * 100,
                txHash: result.txHash,
            });
            logger_js_1.logger.info(`[STOPLOSS CHECK] Stoploss EXECUTED for position ${position.id}: ${result.txHash}`, {
                positionId: position.id,
                txHash: result.txHash,
                quoteOutputUsd,
                lossPercent: ((quoteOutputUsd - (position.cost * position.balance)) / (position.cost * position.balance)) * 100,
            });
        }
        else {
            logger_js_1.logger.error(`[STOPLOSS CHECK] Stoploss execution FAILED for position ${position.id}: ${result.error}`, {
                positionId: position.id,
                error: result.error,
            });
        }
    }
    /**
     * Execute profit-taking sell for a specific position
     * STRICT PROFIT CHECK: Verifies quote output meets profit threshold before executing
     */
    async executeSell(position, currentPrice) {
        const symbol = position.symbol || 'WETH';
        const tokenAddress = position.tokenAddress || config_js_1.tokenConfig.wethAddress;
        // Calculate token amount to sell based on position balance
        const tokenDecimals = 18; // Assuming 18 decimals
        const totalBalance = BigInt(Math.floor(position.balance * Math.pow(10, tokenDecimals)));
        if (totalBalance <= 0n) {
            logger_js_1.logger.warn(`No balance to sell for position ${position.id}`);
            return;
        }
        // Calculate sell amount (considering moonbag)
        let sellAmount = totalBalance;
        let moonbagAmount = 0n;
        if (config_js_1.botConfig.BANK_MOONBAG && config_js_1.botConfig.MOONBAG_PERCENTAGE > 0) {
            moonbagAmount = (totalBalance * BigInt(config_js_1.botConfig.MOONBAG_PERCENTAGE)) / 100n;
            sellAmount = totalBalance - moonbagAmount;
            logger_js_1.logger.info(`Keeping moonbag for position ${position.id}:`, {
                percentage: config_js_1.botConfig.MOONBAG_PERCENTAGE,
                amount: Number(moonbagAmount) / Math.pow(10, tokenDecimals),
            });
        }
        // ============================================================================
        // STRICT PROFIT CHECK: Get quote first before executing swap
        // ============================================================================
        logger_js_1.logger.info(`[PROFIT CHECK] Getting sell quote for position ${position.id}`, {
            positionId: position.id,
            costBasis: position.cost,
            currentPrice,
            sellAmount: Number(sellAmount) / Math.pow(10, tokenDecimals),
            tokenDecimals,
        });
        // 1. Get quote first (before executing swap)
        const quote = await (0, zeroX_js_1.getQuote)(tokenAddress, config_js_1.tokenConfig.usdgAddress, sellAmount.toString(), undefined, this.account.address);
        if (!quote) {
            logger_js_1.logger.error(`[PROFIT CHECK] Failed to get quote for position ${position.id}, skipping sell`);
            return;
        }
        // 2. Calculate minimum required output for profitable sell
        // Convert cost basis to USDG (position.cost is in USD terms)
        const costBasisUsd = position.cost * (Number(sellAmount) / Math.pow(10, tokenDecimals));
        const minProfitMultiplier = 1 + (config_js_1.botConfig.PROFIT_THRESHOLD_PERCENT / 100);
        const minRequiredOutput = costBasisUsd * minProfitMultiplier;
        // Quote output is in base units (18 decimals for USDG)
        const quoteOutputUsd = Number(quote.buyAmount) / Math.pow(10, tokenDecimals);
        // 3. Log detailed comparison
        logger_js_1.logger.info(`[PROFIT CHECK] Sell quote analysis for position ${position.id}:`, {
            positionId: position.id,
            costBasis: position.cost,
            costBasisUsd,
            sellTokenAmount: Number(sellAmount) / Math.pow(10, tokenDecimals),
            quoteOutputUsd,
            minRequiredOutput,
            profitThresholdPercent: config_js_1.botConfig.PROFIT_THRESHOLD_PERCENT,
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
            logger_js_1.logger.warn(`[PROFIT CHECK] Sell BLOCKED for position ${position.id}: Quote below profit threshold`, {
                positionId: position.id,
                quoteOutputUsd,
                minRequiredOutput,
                shortfall: minRequiredOutput - quoteOutputUsd,
                shortfallPercent: ((minRequiredOutput - quoteOutputUsd) / minRequiredOutput) * 100,
                reason: 'Quote output does not meet minimum profit requirement',
            });
            return; // Skip this sell - protect against slippage and bad quotes
        }
        logger_js_1.logger.info(`[PROFIT CHECK] Sell APPROVED for position ${position.id}: Quote meets profit threshold`, {
            positionId: position.id,
            quoteOutputUsd,
            minRequiredOutput,
            profitAboveThreshold: quoteOutputUsd - minRequiredOutput,
        });
        // ============================================================================
        // Execute the sell (only after profit check passes)
        // ============================================================================
        const result = await (0, wallet_js_1.executeSwap)(quote, this.account);
        if (result.success) {
            if (moonbagAmount > 0n) {
                // Update position with remaining moonbag
                const moonbagBalance = Number(moonbagAmount) / Math.pow(10, tokenDecimals);
                const updatedPosition = {
                    ...position,
                    balance: moonbagBalance,
                    cost: currentPrice, // Reset cost basis to current price
                };
                this.positions = await (0, storage_js_1.savePosition)(this.positions, updatedPosition);
                (0, logger_js_1.logTrade)('MOONBAG', symbol, {
                    positionId: position.id,
                    remainingBalance: moonbagBalance,
                    newCostBasis: currentPrice,
                });
            }
            else {
                // Full sell - reset position to empty state
                const updatedPosition = {
                    ...position,
                    balance: 0,
                    cost: 0,
                    lastBuyAt: undefined,
                };
                this.positions = await (0, storage_js_1.savePosition)(this.positions, updatedPosition);
            }
            (0, logger_js_1.logTrade)('SELL', symbol, {
                positionId: position.id,
                amount: Number(sellAmount) / Math.pow(10, tokenDecimals),
                price: currentPrice,
                costBasis: position.cost,
                actualOutputUsd: quoteOutputUsd,
                expectedOutputUsd: minRequiredOutput,
                profit: (((currentPrice - position.cost) / position.cost) * 100).toFixed(2) + '%',
                txHash: result.txHash,
            });
            logger_js_1.logger.info(`[PROFIT CHECK] Sell EXECUTED for position ${position.id}: ${result.txHash}`, {
                positionId: position.id,
                txHash: result.txHash,
                actualOutputUsd: quoteOutputUsd,
                minRequiredOutput,
            });
        }
        else {
            logger_js_1.logger.error(`[PROFIT CHECK] Sell execution FAILED for position ${position.id}: ${result.error}`, {
                positionId: position.id,
                error: result.error,
            });
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
        return { ...this.positions };
    }
    /**
     * Get positions as array
     */
    getPositionsArray() {
        return (0, storage_js_1.getPositionsArray)(this.positions);
    }
    /**
     * Check if bot is running
     */
    isRunning() {
        return this.running;
    }
    /**
     * Generate and save grid positions
     * Useful for initial setup
     */
    async generateGridPositions(basePrice, numGrids, tokenAddress, symbol) {
        const { generateGridPositions: generateFn } = await import('./storage.js');
        this.positions = generateFn(basePrice, config_js_1.botConfig.GRID_SIZE_USD, config_js_1.botConfig.GRID_SPACING_PERCENT, numGrids, tokenAddress || config_js_1.tokenConfig.wethAddress, symbol || 'WETH');
        await (0, storage_js_1.savePositions)(this.positions);
        logger_js_1.logger.info(`Generated and saved ${numGrids} grid positions`);
    }
}
exports.GridBot = GridBot;
//# sourceMappingURL=bot.js.map