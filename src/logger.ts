import winston from 'winston';
import path from 'path';

// Get project root directory (works with both ESM and CJS after build)
const PROJECT_ROOT = process.cwd();
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');

/**
 * Create winston logger with console and file transports
 */
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, ...metadata }) => {
      let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
      if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
      }
      return msg;
    })
  ),
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp, ...metadata }) => {
          let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
          if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
          }
          return msg;
        })
      ),
    }),
    // File output - all logs
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'bot.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File output - error logs only
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File output - trade logs
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'trades.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

/**
 * Log a trade event to the trades log file
 */
export function logTrade(
  type: 'BUY' | 'SELL' | 'STOPLOSS' | 'MOONBAG' | 'BANK',
  tokenSymbol: string,
  details: Record<string, unknown>
): void {
  logger.info(`TRADE: ${type} ${tokenSymbol}`, {
    tradeType: type,
    token: tokenSymbol,
    ...details,
  });
}

/**
 * Log grid position update
 */
export function logPosition(
  action: 'CREATE' | 'UPDATE' | 'CLOSE',
  position: Record<string, unknown>
): void {
  logger.info(`POSITION: ${action}`, { action, position });
}

/**
 * Log price check
 */
export function logPriceCheck(
  tokenSymbol: string,
  currentPrice: number,
  thresholds: Record<string, number>
): void {
  logger.debug(`Price check: ${tokenSymbol}`, {
    token: tokenSymbol,
    price: currentPrice,
    ...thresholds,
  });
}
