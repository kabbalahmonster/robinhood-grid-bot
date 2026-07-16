"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.robinhoodChain = void 0;
exports.createAccount = createAccount;
exports.createPublicClientInstance = createPublicClientInstance;
exports.createWalletClientInstance = createWalletClientInstance;
exports.getTokenBalance = getTokenBalance;
exports.checkAndApproveToken = checkAndApproveToken;
exports.executeSwap = executeSwap;
exports.getNativeBalance = getNativeBalance;
exports.waitForTransaction = waitForTransaction;
exports.swapWethToToken = swapWethToToken;
exports.swapTokenToWeth = swapTokenToWeth;
exports.swapWethToUsd = swapWethToUsd;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const config_js_1 = require("./config.js");
const logger_js_1 = require("./logger.js");
const zeroX_js_1 = require("./zeroX.js");
// ERC20 ABI for balance and allowance checks
const erc20Abi = (0, viem_1.parseAbi)([
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
]);
/**
 * Robinhood Chain configuration
 */
exports.robinhoodChain = {
    id: config_js_1.walletConfig.chainId,
    name: 'Robinhood Chain',
    nativeCurrency: {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
    },
    rpcUrls: {
        default: {
            http: [config_js_1.walletConfig.rpcUrl],
        },
        public: {
            http: [config_js_1.walletConfig.rpcUrl],
        },
    },
};
/**
 * Create account from private key
 */
function createAccount() {
    const key = config_js_1.walletConfig.privateKey.startsWith('0x')
        ? config_js_1.walletConfig.privateKey
        : `0x${config_js_1.walletConfig.privateKey}`;
    return (0, accounts_1.privateKeyToAccount)(key);
}
/**
 * Create public client for reading blockchain data
 */
function createPublicClientInstance() {
    return (0, viem_1.createPublicClient)({
        chain: exports.robinhoodChain,
        transport: (0, viem_1.http)(config_js_1.walletConfig.rpcUrl),
    });
}
/**
 * Create wallet client for signing transactions
 */
function createWalletClientInstance(account) {
    return (0, viem_1.createWalletClient)({
        account,
        chain: exports.robinhoodChain,
        transport: (0, viem_1.http)(config_js_1.walletConfig.rpcUrl),
    });
}
/**
 * Get token balance
 */
async function getTokenBalance(tokenAddress, ownerAddress) {
    const publicClient = createPublicClientInstance();
    try {
        const [balance, decimals, symbol] = await Promise.all([
            publicClient.readContract({
                address: tokenAddress,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [ownerAddress],
            }),
            publicClient.readContract({
                address: tokenAddress,
                abi: erc20Abi,
                functionName: 'decimals',
            }),
            publicClient.readContract({
                address: tokenAddress,
                abi: erc20Abi,
                functionName: 'symbol',
            }),
        ]);
        return {
            address: tokenAddress,
            symbol,
            balance,
            decimals,
            formattedBalance: (0, viem_1.formatUnits)(balance, decimals),
        };
    }
    catch (error) {
        logger_js_1.logger.error(`Error getting balance for token ${tokenAddress}:`, error);
        throw error;
    }
}
/**
 * Check if approval is needed and approve if necessary
 */
async function checkAndApproveToken(tokenAddress, spenderAddress, amount, account) {
    const publicClient = createPublicClientInstance();
    const walletClient = createWalletClientInstance(account);
    try {
        // Check current allowance
        const currentAllowance = await publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [account.address, spenderAddress],
        });
        if (currentAllowance >= amount) {
            logger_js_1.logger.debug(`Token ${tokenAddress} already approved for ${spenderAddress}`);
            return true;
        }
        // Approve max uint256
        const maxUint256 = 2n ** 256n - 1n;
        logger_js_1.logger.info(`Approving token ${tokenAddress} for ${spenderAddress}`);
        const hash = await walletClient.writeContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [spenderAddress, maxUint256],
            chain: exports.robinhoodChain,
            account: account,
        });
        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === 'success') {
            logger_js_1.logger.info(`Approval successful: ${hash}`);
            return true;
        }
        else {
            logger_js_1.logger.error(`Approval failed: ${hash}`);
            return false;
        }
    }
    catch (error) {
        logger_js_1.logger.error(`Error approving token ${tokenAddress}:`, error);
        return false;
    }
}
/**
 * Execute a swap transaction from a 0x quote
 */
async function executeSwap(quote, account) {
    const publicClient = createPublicClientInstance();
    const walletClient = createWalletClientInstance(account);
    try {
        // Check if approval is needed for sell token
        if (quote.sellToken.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
            const approved = await checkAndApproveToken(quote.sellToken, quote.allowanceTarget, BigInt(quote.sellAmount), account);
            if (!approved) {
                return {
                    success: false,
                    error: 'Token approval failed',
                };
            }
        }
        // Execute the swap transaction
        logger_js_1.logger.info('Executing swap transaction...', {
            to: quote.transaction.to,
            value: quote.transaction.value,
            gas: quote.transaction.gas,
        });
        const hash = await walletClient.sendTransaction({
            to: quote.transaction.to,
            data: quote.transaction.data,
            value: BigInt(quote.transaction.value),
            gas: BigInt(quote.transaction.gas),
            gasPrice: BigInt(quote.transaction.gasPrice),
            chain: exports.robinhoodChain,
            account: account,
        });
        logger_js_1.logger.info(`Swap transaction sent: ${hash}`);
        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === 'success') {
            logger_js_1.logger.info(`✅ Swap successful: ${hash}`);
            return {
                success: true,
                txHash: hash,
                buyAmount: quote.buyAmount,
                sellAmount: quote.sellAmount,
            };
        }
        else {
            // Try to get revert reason
            let revertReason = 'Transaction reverted';
            try {
                const tx = await publicClient.getTransaction({ hash });
                await publicClient.call({
                    to: tx.to,
                    data: tx.input,
                    value: tx.value,
                    account: account.address,
                });
            }
            catch (callError) {
                if (callError?.shortMessage) {
                    revertReason = callError.shortMessage;
                }
                else if (callError?.message) {
                    revertReason = callError.message;
                }
            }
            logger_js_1.logger.error(`❌ Swap failed: ${hash}`);
            logger_js_1.logger.error(`   Reason: ${revertReason}`);
            logger_js_1.logger.error(`   Gas used: ${receipt.gasUsed}`);
            return {
                success: false,
                error: revertReason,
                txHash: hash,
            };
        }
    }
    catch (error) {
        logger_js_1.logger.error('Error executing swap:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}
/**
 * Get native ETH balance
 */
async function getNativeBalance(address) {
    const publicClient = createPublicClientInstance();
    try {
        const balance = await publicClient.getBalance({
            address: address,
        });
        return {
            address: '0x0000000000000000000000000000000000000000',
            symbol: 'ETH',
            balance,
            decimals: 18,
            formattedBalance: (0, viem_1.formatUnits)(balance, 18),
        };
    }
    catch (error) {
        logger_js_1.logger.error('Error getting native balance:', error);
        throw error;
    }
}
/**
 * Wait for transaction receipt with timeout
 */
async function waitForTransaction(txHash, timeoutMs = 60000) {
    const publicClient = createPublicClientInstance();
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try {
            const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
            if (receipt) {
                return receipt;
            }
        }
        catch (error) {
            // Transaction not yet mined
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return null;
}
/**
 * Swap WETH to trading token
 * Used when buying the trading token with WETH as quote currency
 */
async function swapWethToToken(tokenAddress, wethAmount, account) {
    const quote = await (0, zeroX_js_1.getQuote)(config_js_1.tokenConfig.wethAddress, // sell WETH
    tokenAddress, // buy trading token
    wethAmount.toString(), undefined, account.address);
    if (!quote) {
        return { success: false, error: 'Failed to get WETH->Token quote' };
    }
    return executeSwap(quote, account);
}
/**
 * Swap trading token to WETH
 * Used when selling the trading token for WETH
 */
async function swapTokenToWeth(tokenAddress, tokenAmount, account) {
    const quote = await (0, zeroX_js_1.getQuote)(tokenAddress, // sell trading token
    config_js_1.tokenConfig.wethAddress, // buy WETH
    tokenAmount.toString(), undefined, account.address);
    if (!quote) {
        return { success: false, error: 'Failed to get Token->WETH quote' };
    }
    return executeSwap(quote, account);
}
/**
 * Swap WETH to USDG (bank profits)
 * Used to bank profits in USDG
 */
async function swapWethToUsd(wethAmount, account) {
    const quote = await (0, zeroX_js_1.getQuote)(config_js_1.tokenConfig.wethAddress, // sell WETH
    config_js_1.tokenConfig.usdgAddress, // buy USDG
    wethAmount.toString(), undefined, account.address);
    if (!quote) {
        return { success: false, error: 'Failed to get WETH->USDG quote' };
    }
    return executeSwap(quote, account);
}
//# sourceMappingURL=wallet.js.map