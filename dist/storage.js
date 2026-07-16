"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPositions = loadPositions;
exports.savePositions = savePositions;
exports.savePosition = savePosition;
exports.updatePosition = updatePosition;
exports.removePosition = removePosition;
exports.getPositionById = getPositionById;
exports.getPositionsArray = getPositionsArray;
exports.getEmptyPositions = getEmptyPositions;
exports.getFilledPositions = getFilledPositions;
exports.hasPosition = hasPosition;
exports.generateGridPositions = generateGridPositions;
exports.initializePositions = initializePositions;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const logger_js_1 = require("./logger.js");
// Get project root directory
const PROJECT_ROOT = process.cwd();
const POSITIONS_FILE = path_1.default.join(PROJECT_ROOT, 'positions.json');
const DATA_VERSION = '2.0.0';
/**
 * Load positions from JSON file
 * Returns a Record of positions keyed by their ID
 */
async function loadPositions() {
    try {
        const data = await promises_1.default.readFile(POSITIONS_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        // Validate data structure
        if (!parsed.positions || typeof parsed.positions !== 'object') {
            logger_js_1.logger.warn('Invalid positions file format, starting fresh');
            return {};
        }
        const positionCount = Object.keys(parsed.positions).length;
        logger_js_1.logger.info(`Loaded ${positionCount} positions from storage`);
        return parsed.positions;
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            logger_js_1.logger.info('No positions file found, starting fresh');
            return {};
        }
        logger_js_1.logger.error('Error loading positions:', error);
        throw error;
    }
}
/**
 * Save positions to JSON file
 * Accepts a Record of positions keyed by their ID
 */
async function savePositions(positions) {
    const data = {
        positions,
        lastUpdated: Date.now(),
        version: DATA_VERSION,
    };
    try {
        await promises_1.default.writeFile(POSITIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
        logger_js_1.logger.debug(`Saved ${Object.keys(positions).length} positions to storage`);
    }
    catch (error) {
        logger_js_1.logger.error('Error saving positions:', error);
        throw error;
    }
}
/**
 * Add or update a position
 */
async function savePosition(positions, position) {
    const updated = { ...positions, [position.id]: position };
    await savePositions(updated);
    logger_js_1.logger.info(`Saved position ${position.id}`, {
        id: position.id,
        balance: position.balance,
        cost: position.cost,
        buyMin: position.buyMin,
        buyMax: position.buyMax,
        sellMin: position.sellMin,
        stoploss: position.stoploss,
    });
    return updated;
}
/**
 * Update an existing position by ID
 */
async function updatePosition(positions, id, updates) {
    if (!positions[id]) {
        throw new Error(`Position not found: ${id}`);
    }
    const updated = {
        ...positions,
        [id]: { ...positions[id], ...updates },
    };
    await savePositions(updated);
    logger_js_1.logger.info(`Updated position ${id}`);
    return updated;
}
/**
 * Remove a position by ID
 */
async function removePosition(positions, id) {
    if (!positions[id]) {
        throw new Error(`Position not found: ${id}`);
    }
    const removed = positions[id];
    const { [id]: _, ...rest } = positions;
    await savePositions(rest);
    logger_js_1.logger.info(`Removed position ${id}`, {
        id: removed.id,
        balance: removed.balance,
        cost: removed.cost,
    });
    return { updated: rest, removed };
}
/**
 * Get position by ID
 */
function getPositionById(positions, id) {
    return positions[id] || null;
}
/**
 * Get all positions as an array
 */
function getPositionsArray(positions) {
    return Object.values(positions);
}
/**
 * Get all empty positions (balance === 0)
 */
function getEmptyPositions(positions) {
    return Object.values(positions).filter((p) => p.balance === 0);
}
/**
 * Get all filled positions (balance > 0)
 */
function getFilledPositions(positions) {
    return Object.values(positions).filter((p) => p.balance > 0);
}
/**
 * Check if a position exists
 */
function hasPosition(positions, id) {
    return id in positions;
}
/**
 * Generate grid positions dynamically
 * Uses GRID_SPACING_PERCENT from config to calculate levels
 */
function generateGridPositions(basePrice, gridSizeUsd, gridSpacingPercent, numGrids, tokenAddress, symbol) {
    const positions = {};
    const spacingFactor = gridSpacingPercent / 100;
    for (let i = 0; i < numGrids; i++) {
        // Calculate grid level (each level is spaced by gridSpacingPercent)
        // Level 0 is the lowest, level numGrids-1 is the highest
        const level = i;
        const buyMin = basePrice * Math.pow(1 + spacingFactor, level);
        const buyMax = basePrice * Math.pow(1 + spacingFactor, level + 1);
        const sellMin = buyMax * (1 + spacingFactor); // Sell at next level up
        const stoploss = buyMin * (1 - spacingFactor); // Stoploss below buyMin
        const id = (i + 1).toString();
        positions[id] = {
            id,
            balance: 0,
            cost: 0,
            buyMin: Math.round(buyMin),
            buyMax: Math.round(buyMax),
            sellMin: Math.round(sellMin),
            stoploss: Math.round(stoploss),
            tokenAddress,
            symbol,
            createdAt: Date.now(),
        };
    }
    logger_js_1.logger.info(`Generated ${numGrids} grid positions`, {
        basePrice,
        gridSpacingPercent,
        firstGrid: positions['1'],
        lastGrid: positions[numGrids.toString()],
    });
    return positions;
}
/**
 * Initialize positions from file or generate if empty
 */
async function initializePositions(generateIfEmpty, basePrice, gridSizeUsd, gridSpacingPercent, numGrids, tokenAddress, symbol) {
    let positions = await loadPositions();
    // If no positions and generation is enabled, create them
    if (Object.keys(positions).length === 0 && generateIfEmpty && basePrice && gridSpacingPercent && numGrids) {
        positions = generateGridPositions(basePrice, gridSizeUsd || 100, gridSpacingPercent, numGrids, tokenAddress, symbol);
        await savePositions(positions);
    }
    return positions;
}
//# sourceMappingURL=storage.js.map