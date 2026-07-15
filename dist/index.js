#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_js_1 = require("./bot.js");
const config_js_1 = require("./config.js");
const logger_js_1 = require("./logger.js");
/**
 * Main entry point for the Robinhood Grid Trading Bot
 */
async function main() {
    try {
        // Validate configuration
        (0, config_js_1.validateConfig)();
        logger_js_1.logger.info('Configuration validated successfully');
        logger_js_1.logger.info('Bot config:', (0, config_js_1.logConfig)());
        // Create and initialize bot
        const bot = new bot_js_1.GridBot();
        await bot.initialize();
        // Handle graceful shutdown
        const shutdown = async (signal) => {
            logger_js_1.logger.info(`Received ${signal}, shutting down...`);
            await bot.stop();
            process.exit(0);
        };
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        // Handle uncaught errors
        process.on('uncaughtException', (error) => {
            logger_js_1.logger.error('Uncaught exception:', error);
            bot.stop().then(() => process.exit(1));
        });
        process.on('unhandledRejection', (reason, promise) => {
            logger_js_1.logger.error('Unhandled rejection at:', promise, 'reason:', reason);
        });
        // Start the bot
        await bot.start();
        // Keep the process running
        logger_js_1.logger.info('Bot is running. Press Ctrl+C to stop.');
    }
    catch (error) {
        logger_js_1.logger.error('Failed to start bot:', error);
        process.exit(1);
    }
}
// Run main
main();
//# sourceMappingURL=index.js.map