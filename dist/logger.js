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
// Get project root directory (works with both ESM and CJS after build)
const PROJECT_ROOT = process.cwd();
const LOGS_DIR = path_1.default.join(PROJECT_ROOT, 'logs');
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
        // File output - all logs
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