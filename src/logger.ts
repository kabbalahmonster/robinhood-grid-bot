import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Get project root directory (works with both ESM and CJS after build)
const PROJECT_ROOT = process.cwd();
const LOGS_DIR = path.join(PROJECT_ROOT, 'logs');

/**
 * Get the next available log file number
 * Checks logs/ folder for existing files and finds next available number (log1.txt, log2.txt, etc.)
 */
function getNextLogFileNumber(): number {
  try {
    // Ensure logs directory exists
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
      return 1;
    }

    // Read existing files in logs directory
    const files = fs.readdirSync(LOGS_DIR);
    
    // Find all files matching logN.txt pattern
    const logNumbers: number[] = [];
    const logPattern = /^log(\d+)\.txt$/;
    
    for (const file of files) {
      const match = file.match(logPattern);
      if (match) {
        logNumbers.push(parseInt(match[1], 10));
      }
    }

    // Return next available number
    if (logNumbers.length === 0) {
      return 1;
    }

    return Math.max(...logNumbers) + 1;
  } catch (error) {
    console.error('Error determining next log file number:', error);
    return 1;
  }
}

/**
 * Generate sequential log filename
 */
const logFileNumber = getNextLogFileNumber();
const sequentialLogFile = path.join(LOGS_DIR, `log${logFileNumber}.txt`);

console.log(`Logging to: ${sequentialLogFile}`);

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
    // File output - sequential numbered log file for this session
    new winston.transports.File({
      filename: sequentialLogFile,
      maxsize: 5242880, // 5MB
      maxFiles: 1,
    }),
    // File output - all logs (rotating)
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
