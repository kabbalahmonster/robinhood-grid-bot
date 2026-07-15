"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPositions = loadPositions;
exports.savePositions = savePositions;
exports.addPosition = addPosition;
exports.updatePosition = updatePosition;
exports.removePosition = removePosition;
exports.getPositionByToken = getPositionByToken;
exports.hasPosition = hasPosition;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const logger_js_1 = require("./logger.js");
// Get project root directory
const PROJECT_ROOT = process.cwd();
const POSITIONS_FILE = path_1.default.join(PROJECT_ROOT, 'positions.json');
const DATA_VERSION = '1.0.0';
/**
 * Load positions from JSON file
 */
async function loadPositions() {
    try {
        const data = await promises_1.default.readFile(POSITIONS_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        // Validate data structure
        if (!parsed.positions || !Array.isArray(parsed.positions)) {
            logger_js_1.logger.warn('Invalid positions file format, starting fresh');
            return [];
        }
        logger_js_1.logger.info(`Loaded ${parsed.positions.length} positions from storage`);
        return parsed.positions;
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            logger_js_1.logger.info('No positions file found, starting fresh');
            return [];
        }
        logger_js_1.logger.error('Error loading positions:', error);
        throw error;
    }
}
/**
 * Save positions to JSON file
 */
async function savePositions(positions) {
    const data = {
        positions,
        lastUpdated: Date.now(),
        version: DATA_VERSION,
    };
    try {
        await promises_1.default.writeFile(POSITIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
        logger_js_1.logger.debug(`Saved ${positions.length} positions to storage`);
    }
    catch (error) {
        logger_js_1.logger.error('Error saving positions:', error);
        throw error;
    }
}
/**
 * Add a new position
 */
async function addPosition(positions, newPosition) {
    const updated = [...positions, newPosition];
    await savePositions(updated);
    logger_js_1.logger.info(`Added position for ${newPosition.symbol}`, {
        symbol: newPosition.symbol,
        balance: newPosition.balance,
        cost: newPosition.cost,
    });
    return updated;
}
/**
 * Update an existing position
 */
async function updatePosition(positions, index, updates) {
    if (index < 0 || index >= positions.length) {
        throw new Error(`Invalid position index: ${index}`);
    }
    const updated = [...positions];
    updated[index] = { ...updated[index], ...updates };
    await savePositions(updated);
    logger_js_1.logger.info(`Updated position ${index} for ${updated[index].symbol}`);
    return updated;
}
/**
 * Remove a position
 */
async function removePosition(positions, index) {
    if (index < 0 || index >= positions.length) {
        throw new Error(`Invalid position index: ${index}`);
    }
    const removed = positions[index];
    const updated = positions.filter((_, i) => i !== index);
    await savePositions(updated);
    logger_js_1.logger.info(`Removed position for ${removed.symbol}`, {
        symbol: removed.symbol,
        balance: removed.balance,
        cost: removed.cost,
    });
    return { updated, removed };
}
/**
 * Get position by token address
 */
function getPositionByToken(positions, tokenAddress) {
    const index = positions.findIndex((p) => p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase());
    return {
        position: index >= 0 ? positions[index] : null,
        index,
    };
}
/**
 * Check if a token has a position
 */
function hasPosition(positions, tokenAddress) {
    return positions.some((p) => p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase());
}
//# sourceMappingURL=storage.js.map