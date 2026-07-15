# Robinhood Chain Grid Trading Bot

A TypeScript/Node.js grid trading bot for Robinhood Chain (Chain ID 4663), ported from the original Solana Python bot. This bot uses **viem** for blockchain interactions and the **0x API** for swap quotes and execution.

## Features

- **Grid Trading**: Automated buy/sell orders within configurable price ranges
- **Profit Banking**: Automatically banks profits in USDG (stablecoin)
- **Moonbag Feature**: Keep a percentage of tokens on sell for potential upside
- **Stop Loss Protection**: Automatic sell when price drops below threshold
- **Position Tracking**: Persistent storage of positions in JSON file
- **Comprehensive Logging**: Console and file logging with timestamps
- **Configurable Flags**: Enable/disable specific features via environment variables
- **Retry Logic**: Exponential backoff for API failures
- **Max Positions**: Limit total open positions

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Grid Trading Bot                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │  Grid    │  │  Wallet  │  │  0x API  │  │  Storage    │  │
│  │  Logic   │◄─┤  (viem)  │◄─┤  Client  │◄─┤  (JSON)     │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────┘  │
│         │                                                    │
│         ▼                                                    │
│  ┌────────────────────────────────────────────────────┐     │
│  │              Position Management                    │     │
│  │  • Buy at buyMin/buyMax range                      │     │
│  │  • Sell at sellMin (profit target)                 │     │
│  │  • Stop loss protection                            │     │
│  │  • Moonbag retention on sell                       │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js 18+ 
- npm or yarn
- 0x API key (get one at https://0x.org/)
- Robinhood Chain wallet with private key
- USDG for trading (bank currency)

## Installation

1. Clone or create the project directory:
```bash
cd robinhood-grid-bot
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment file and configure:
```bash
cp .env.example .env
# Edit .env with your settings
```

4. Build the project:
```bash
npm run build
```

## Configuration

Edit `.env` file with your settings:

```env
# Wallet Configuration
PRIVATE_KEY=your_private_key_here

# 0x API Configuration
ZEROX_API_KEY=your_0x_api_key_here

# Trading Configuration
CHECK_INTERVAL_MS=30000          # Check positions every 30 seconds
MAX_POSITIONS=10                 # Max open positions
BUY_COOLDOWN_MS=60000            # Cooldown between buys
GRID_SIZE_USD=100                # USD amount per grid position
PROFIT_THRESHOLD_PERCENT=5       # Profit target percentage

# Feature Flags
BANK_PROFIT=true                 # Bank profits in USDG
SELLS_ACTIVE=true                # Enable sells
BUYS_ACTIVE=true                 # Enable buys
BANK_MOONBAG=true                # Enable moonbag feature
STOPLOSS_ACTIVE=true             # Enable stop loss

# Moonbag Settings
MOONBAG_PERCENTAGE=20            # Keep 20% on sell

# Stop Loss Settings
STOPLOSS_PERCENTAGE=-10          # Sell at 10% loss

# Token Addresses (Robinhood Chain)
USDG_ADDRESS=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
WETH_ADDRESS=0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73

# RPC Configuration
RPC_URL=https://robinhood.rh-chain.com
CHAIN_ID=4663
```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Build & Run
```bash
npm run build
npm start
```

## Project Structure

```
robinhood-grid-bot/
├── src/
│   ├── index.ts        # Entry point
│   ├── bot.ts          # Main bot logic
│   ├── config.ts       # Configuration management
│   ├── types.ts        # TypeScript interfaces
│   ├── logger.ts       # Winston logging setup
│   ├── storage.ts      # Position persistence
│   ├── wallet.ts       # viem wallet integration
│   └── zeroX.ts        # 0x API client
├── dist/               # Compiled JavaScript
├── logs/               # Log files
├── positions.json      # Position storage
├── .env                # Environment variables
├── .env.example        # Example environment
├── package.json        # Dependencies
└── tsconfig.json       # TypeScript config
```

## Position Structure

Each position is stored with the following structure:

```typescript
{
  balance: string;      // Token balance
  cost: string;         // Average cost basis
  buyMin: string;       // Minimum buy price
  buyMax: string;       // Maximum buy price
  sellMin: string;      // Profit target price
  stoploss: string;     // Stop loss price
  tokenAddress: string; // Token contract address
  symbol: string;       // Token symbol
  createdAt: number;    // Creation timestamp
  lastBuyAt: number;    // Last buy timestamp
}
```

## How It Works

### Buy Logic
1. Bot checks if current price is within buyMin/buyMax range
2. If within range and under max positions, executes buy
3. Stores position with cost basis and targets

### Sell Logic
1. Monitors positions against sellMin (profit target)
2. When target reached, executes sell
3. If moonbag enabled, keeps specified percentage
4. Updates position or removes if fully sold

### Stop Loss
1. Monitors positions against stoploss price
2. If price drops to stoploss, sells entire position
3. Removes position after stop loss execution

### Profit Banking
1. Sells are executed into USDG (stablecoin)
2. Profits are automatically "banked" in USDG
3. Ready for next grid position entry

## Logging

Logs are written to:
- `logs/bot.log` - All logs
- `logs/error.log` - Error logs only
- `logs/trades.log` - Trade execution logs
- Console - Colored output for development

## Safety Features

- **Stop Loss**: Automatic protection against major losses
- **Max Positions**: Prevents over-leveraging
- **Cooldown Period**: Prevents rapid-fire trading
- **Token Approval**: Handles ERC20 approvals automatically
- **Retry Logic**: Exponential backoff for API failures

## Differences from Python/Solana Version

| Feature | Python/Solana | TypeScript/Robinhood |
|---------|---------------|---------------------|
| Blockchain | Solana | EVM (Robinhood Chain) |
| Swap API | Jupiter Ultra | 0x API |
| Wallet | Solana web3 | viem |
| Stablecoin | USDC | USDG |
| Transactions | Single sig | Gas estimation + signing |
| Balance Checks | getTokenAccountBalance | ERC20 contract calls |

## Troubleshooting

### Build Errors
```bash
rm -rf dist node_modules
npm install
npm run build
```

### Missing API Key
Get a free API key at https://0x.org/ and add to `.env`

### Insufficient Balance
Ensure wallet has:
- USDG for buying
- ETH for gas fees
- Sufficient balance for grid size

### Transaction Failures
Check logs in `logs/error.log` for detailed error messages

## API Reference

### 0x API Endpoints Used
- `/swap/permit2/price` - Get price quotes
- `/swap/permit2/quote` - Get executable swap data

### viem Functions Used
- `createPublicClient` - Read blockchain data
- `createWalletClient` - Sign transactions
- `readContract` - ERC20 balance/allowance checks
- `writeContract` - Token approvals
- `sendTransaction` - Execute swaps

## License

MIT

## Disclaimer

This bot is provided as-is for educational purposes. Trading cryptocurrencies involves risk. Always test thoroughly with small amounts before deploying significant capital.
