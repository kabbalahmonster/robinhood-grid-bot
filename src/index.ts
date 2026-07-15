#!/usr/bin/env node

import { GridBot } from './bot.js';
import { validateConfig, logConfig } from './config.js';
import { logger } from './logger.js';

/**
 * Main entry point for the Robinhood Grid Trading Bot
 */
async function main(): Promise<void> {
  try {
    // Validate configuration
    validateConfig();
    logger.info('Configuration validated successfully');
    logger.info('Bot config:', logConfig());

    // Create and initialize bot
    const bot = new GridBot();
    await bot.initialize();

    // Handle graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down...`);
      await bot.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      bot.stop().then(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    });

    // Start the bot
    await bot.start();

    // Keep the process running
    logger.info('Bot is running. Press Ctrl+C to stop.');
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Run main
main();
