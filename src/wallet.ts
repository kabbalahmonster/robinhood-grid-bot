import {
  createPublicClient,
  createWalletClient,
  http,
  PrivateKeyAccount,
  parseAbi,
  formatUnits,
  parseUnits,
  Hex,
  TransactionReceipt,
  PublicClient,
  WalletClient,
  Chain,
  Account,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { walletConfig, tokenConfig } from './config.js';
import { TokenBalance, TradeResult } from './types.js';
import { logger } from './logger.js';
import { ZeroXQuote, getQuote } from './zeroX.js';

// Permit2 ABI for allowance checks
const permit2Abi = parseAbi([
  'function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
]);

// 0x Exchange Proxy address for v2 API
const ZEROX_EXCHANGE_PROXY = '0xDef1C0ded9bec7F1a1670819833240f027b25EfF';

// ERC20 ABI for balance and allowance checks
const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

/**
 * Robinhood Chain configuration
 */
export const robinhoodChain: Chain = {
  id: walletConfig.chainId,
  name: 'Robinhood Chain',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [walletConfig.rpcUrl],
    },
    public: {
      http: [walletConfig.rpcUrl],
    },
  },
} as const;

/**
 * Create account from private key
 */
export function createAccount(): PrivateKeyAccount {
  const key = walletConfig.privateKey.startsWith('0x')
    ? walletConfig.privateKey
    : `0x${walletConfig.privateKey}`;
  return privateKeyToAccount(key as Hex);
}

/**
 * Create public client for reading blockchain data
 */
export function createPublicClientInstance(): PublicClient {
  return createPublicClient({
    chain: robinhoodChain,
    transport: http(walletConfig.rpcUrl),
  });
}

/**
 * Create wallet client for signing transactions
 */
export function createWalletClientInstance(account: PrivateKeyAccount): WalletClient {
  return createWalletClient({
    account,
    chain: robinhoodChain,
    transport: http(walletConfig.rpcUrl),
  });
}

/**
 * Get token balance
 */
export async function getTokenBalance(
  tokenAddress: string,
  ownerAddress: string
): Promise<TokenBalance> {
  const publicClient = createPublicClientInstance();

  try {
    const [balance, decimals, symbol] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress as Hex,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [ownerAddress as Hex],
      }),
      publicClient.readContract({
        address: tokenAddress as Hex,
        abi: erc20Abi,
        functionName: 'decimals',
      }),
      publicClient.readContract({
        address: tokenAddress as Hex,
        abi: erc20Abi,
        functionName: 'symbol',
      }),
    ]);

    return {
      address: tokenAddress,
      symbol,
      balance,
      decimals,
      formattedBalance: formatUnits(balance, decimals),
    };
  } catch (error) {
    logger.error(`Error getting balance for token ${tokenAddress}:`, error);
    throw error;
  }
}

/**
 * Check if approval is needed and approve if necessary
 */
export async function checkAndApproveToken(
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint,
  account: PrivateKeyAccount
): Promise<boolean> {
  const publicClient = createPublicClientInstance();
  const walletClient = createWalletClientInstance(account);

  try {
    // Check current allowance
    const currentAllowance = await publicClient.readContract({
      address: tokenAddress as Hex,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [account.address, spenderAddress as Hex],
    });

    if (currentAllowance >= amount) {
      logger.debug(`Token ${tokenAddress} already approved for ${spenderAddress}`);
      return true;
    }

    // Approve max uint256
    const maxUint256 = 2n ** 256n - 1n;
    
    logger.info(`Approving token ${tokenAddress} for ${spenderAddress}`);
    
    const hash = await walletClient.writeContract({
      address: tokenAddress as Hex,
      abi: erc20Abi,
      functionName: 'approve',
      args: [spenderAddress as Hex, maxUint256],
      chain: robinhoodChain,
      account: account,
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (receipt.status === 'success') {
      logger.info(`Approval successful: ${hash}`);
      return true;
    } else {
      logger.error(`Approval failed: ${hash}`);
      return false;
    }
  } catch (error) {
    logger.error(`Error approving token ${tokenAddress}:`, error);
    return false;
  }
}

/**
 * Check if Permit2 approval is needed and approve if necessary
 * 0x v2 API uses Permit2 for token transfers
 */
export async function checkAndApprovePermit2(
  tokenAddress: string,
  amount: bigint,
  account: PrivateKeyAccount
): Promise<boolean> {
  const publicClient = createPublicClientInstance();
  const walletClient = createWalletClientInstance(account);

  try {
    // Check current Permit2 allowance for 0x Exchange Proxy
    const [permitAmount] = await publicClient.readContract({
      address: tokenConfig.permit2Address as Hex,
      abi: permit2Abi,
      functionName: 'allowance',
      args: [account.address, tokenAddress as Hex, ZEROX_EXCHANGE_PROXY as Hex],
    });

    if (permitAmount >= amount) {
      logger.debug(`Token ${tokenAddress} already approved via Permit2`);
      return true;
    }

    // Approve token to Permit2 contract (infinite approval)
    logger.info(`Approving ${tokenAddress} to Permit2 for 0x swaps`);
    
    const maxUint256 = 2n ** 256n - 1n;
    const hash = await walletClient.writeContract({
      address: tokenAddress as Hex,
      abi: erc20Abi,
      functionName: 'approve',
      args: [tokenConfig.permit2Address as Hex, maxUint256],
      chain: robinhoodChain,
      account: account,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    if (receipt.status === 'success') {
      logger.info(`✅ Permit2 approval successful: ${hash}`);
      return true;
    } else {
      logger.error(`❌ Permit2 approval failed: ${hash}`);
      return false;
    }
  } catch (error) {
    logger.error(`Error approving token ${tokenAddress} to Permit2:`, error);
    return false;
  }
}

/**
 * Check if token is approved to Permit2 for 0x swaps (read-only)
 * Permit2 returns (amount, expiration, nonce) - must check expiration too
 */
export async function isApprovedToPermit2(
  tokenAddress: string,
  amount: bigint,
  account: PrivateKeyAccount
): Promise<boolean> {
  const publicClient = createPublicClientInstance();
  try {
    const [permitAmount, expiration] = await publicClient.readContract({
      address: tokenConfig.permit2Address as Hex,
      abi: permit2Abi,
      functionName: 'allowance',
      args: [account.address, tokenAddress as Hex, ZEROX_EXCHANGE_PROXY as Hex],
    });
    
    const now = Math.floor(Date.now() / 1000);
    const isExpired = expiration > 0 && expiration < now;
    const hasEnough = permitAmount >= amount;
    
    logger.debug(`Permit2 allowance check for ${tokenAddress}:`, {
      permitAmount: permitAmount.toString(),
      required: amount.toString(),
      expiration: expiration.toString(),
      now,
      isExpired,
      hasEnough,
      valid: hasEnough && !isExpired
    });
    
    return hasEnough && !isExpired;
  } catch (error) {
    logger.error(`Error checking Permit2 allowance for ${tokenAddress}:`, error);
    return false;
  }
}

/**
 * Execute a swap transaction from a 0x quote
 * WARNING: 0x quotes expire quickly. Only call this if already approved.
 */
export async function executeSwap(
  quote: ZeroXQuote,
  account: PrivateKeyAccount
): Promise<TradeResult> {
  const publicClient = createPublicClientInstance();
  const walletClient = createWalletClientInstance(account);

  try {
    // Check if Permit2 approval exists (quotes expire fast, can't approve during swap)
    if (quote.sellToken.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      const isApproved = await isApprovedToPermit2(
        quote.sellToken,
        BigInt(quote.sellAmount),
        account
      );

      if (!isApproved) {
        // Trigger approval but don't swap this round - quote will expire
        logger.warn(`Token ${quote.sellToken} not approved to Permit2. Approving now, will swap next round.`);
        await checkAndApprovePermit2(quote.sellToken, BigInt(quote.sellAmount), account);
        return {
          success: false,
          error: 'Token not approved to Permit2. Approval submitted, retry next round.',
        };
      }
    }

    // Execute the swap transaction
    logger.info('Executing swap transaction...', {
      to: quote.transaction.to,
      value: quote.transaction.value,
      gas: quote.transaction.gas,
    });

    const hash = await walletClient.sendTransaction({
      to: quote.transaction.to as Hex,
      data: quote.transaction.data as Hex,
      value: BigInt(quote.transaction.value),
      gas: BigInt(quote.transaction.gas),
      gasPrice: BigInt(quote.transaction.gasPrice),
      chain: robinhoodChain,
      account: account,
    });

    logger.info(`Swap transaction sent: ${hash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      logger.info(`✅ Swap successful: ${hash}`);
      return {
        success: true,
        txHash: hash,
        buyAmount: quote.buyAmount,
        sellAmount: quote.sellAmount,
      };
    } else {
      // Try to get revert reason
      let revertReason = 'Transaction reverted';
      try {
        const tx = await publicClient.getTransaction({ hash });
        await publicClient.call({
          to: tx.to!,
          data: tx.input,
          value: tx.value,
          account: account.address,
        });
      } catch (callError: any) {
        if (callError?.shortMessage) {
          revertReason = callError.shortMessage;
        } else if (callError?.message) {
          revertReason = callError.message;
        }
      }
      
      logger.error(`❌ Swap failed: ${hash}`);
      logger.error(`   Reason: ${revertReason}`);
      logger.error(`   Gas used: ${receipt.gasUsed}`);
      return {
        success: false,
        error: revertReason,
        txHash: hash,
      };
    }
  } catch (error) {
    logger.error('Error executing swap:', error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Get native ETH balance
 */
export async function getNativeBalance(address: string): Promise<TokenBalance> {
  const publicClient = createPublicClientInstance();

  try {
    const balance = await publicClient.getBalance({
      address: address as Hex,
    });

    return {
      address: '0x0000000000000000000000000000000000000000',
      symbol: 'ETH',
      balance,
      decimals: 18,
      formattedBalance: formatUnits(balance, 18),
    };
  } catch (error) {
    logger.error('Error getting native balance:', error);
    throw error;
  }
}

/**
 * Wait for transaction receipt with timeout
 */
export async function waitForTransaction(
  txHash: Hex,
  timeoutMs: number = 60000
): Promise<TransactionReceipt | null> {
  const publicClient = createPublicClientInstance();
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      if (receipt) {
        return receipt;
      }
    } catch (error) {
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
export async function swapWethToToken(
  tokenAddress: string,
  wethAmount: bigint,
  account: PrivateKeyAccount
): Promise<TradeResult> {
  const quote = await getQuote(
    tokenConfig.wethAddress, // sell WETH
    tokenAddress,            // buy trading token
    wethAmount.toString(),
    undefined,
    account.address
  );

  if (!quote) {
    return { success: false, error: 'Failed to get WETH->Token quote' };
  }

  return executeSwap(quote, account);
}

/**
 * Swap trading token to WETH
 * Used when selling the trading token for WETH
 */
export async function swapTokenToWeth(
  tokenAddress: string,
  tokenAmount: bigint,
  account: PrivateKeyAccount
): Promise<TradeResult> {
  const quote = await getQuote(
    tokenAddress,            // sell trading token
    tokenConfig.wethAddress, // buy WETH
    tokenAmount.toString(),
    undefined,
    account.address
  );

  if (!quote) {
    return { success: false, error: 'Failed to get Token->WETH quote' };
  }

  return executeSwap(quote, account);
}

/**
 * Swap WETH to USDG (bank profits)
 * Used to bank profits in USDG
 */
export async function swapWethToUsd(
  wethAmount: bigint,
  account: PrivateKeyAccount
): Promise<TradeResult> {
  const quote = await getQuote(
    tokenConfig.wethAddress, // sell WETH
    tokenConfig.usdgAddress, // buy USDG
    wethAmount.toString(),
    undefined,
    account.address
  );

  if (!quote) {
    return { success: false, error: 'Failed to get WETH->USDG quote' };
  }

  return executeSwap(quote, account);
}
