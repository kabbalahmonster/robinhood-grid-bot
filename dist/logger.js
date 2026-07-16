"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.logTrade = logTrade;
exports.logPosition = logPosition;
exports.logPriceCheck = logPriceCheck;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Get project root directory (works with both ESM and CJS after build)
const PROJECT_ROOT = process.cwd();
const LOGS_DIR = path_1.default.join(PROJECT_ROOT, 'logs');
/**
 * Get the next available log file number
 * Checks logs/ folder for existing files and finds next available number (log1.txt, log2.txt, etc.)
 */
function getNextLogFileNumber() {
    try {
        // Ensure logs directory exists
        if (!fs_1.default.existsSync(LOGS_DIR)) {
            fs_1.default.mkdirSync(LOGS_DIR, { recursive: true });
            return 1;
        }
        // Read existing files in logs directory
        const files = fs_1.default.readdirSync(LOGS_DIR);
        // Find all files matching logN.txt pattern
        const logNumbers = [];
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
    }
    catch (error) {
        console.error('Error determining next log file number:', error);
        return 1;
    }
}
/**
 * Generate sequential log filename
 */
const logFileNumber = getNextLogFileNumber();
const sequentialLogFile = path_1.default.join(LOGS_DIR, `log${logFileNumber}.txt`);
console.log(`Logging to: ${sequentialLogFile}`);
/**
 * Create winston logger with console and file transports
 */
exports.logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.printf(({ level, message, timestamp, ...metadata }) => {
        let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
        }
        return msg;
    })),
    transports: [
        // Console output
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.printf(({ level, message, timestamp, ...metadata }) => {
                let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
                if (Object.keys(metadata).length > 0) {
                    msg += ` ${JSON.stringify(metadata)}`;
                }
                return msg;
            })),
        }),
        // File output - sequential numbered log file for this session
        new winston_1.default.transports.File({
            filename: sequentialLogFile,
            maxsize: 5242880, // 5MB
            maxFiles: 1,
        }),
        // File output - all logs (rotating)
        new winston_1.default.transports.File({
            filename: path_1.default.join(LOGS_DIR, 'bot.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // File output - error logs only
        new winston_1.default.transports.File({
            filename: path_1.default.join(LOGS_DIR, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // File output - trade logs
        new winston_1.default.transports.File({
            filename: path_1.default.join(LOGS_DIR, 'trades.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
    ],
});
/**
 * Log a trade event to the trades log file
 */
function logTrade(type, tokenSymbol, details) {
    exports.logger.info(`TRADE: ${type} ${tokenSymbol}`, {
        tradeType: type,
        token: tokenSymbol,
        ...details,
    });
}
/**
 * Log grid position update
 */
function logPosition(action, position) {
    exports.logger.info(`POSITION: ${action}`, { action, position });
}
/**
 * Log price check
 */
function logPriceCheck(tokenSymbol, currentPrice, thresholds) {
    exports.logger.debug(`Price check: ${tokenSymbol}`, {
        token: tokenSymbol,
        price: currentPrice,
        ...thresholds,
    });
}
//# sourceMappingURL=logger.js.map