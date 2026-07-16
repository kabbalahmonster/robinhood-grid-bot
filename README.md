# Robinhood Chain Grid Trading Bot

A TypeScript/Node.js grid trading bot for Robinhood Chain (Chain ID 4663), ported from the original Solana Python bot. This bot uses **viem** for blockchain interactions and the **0x API** for swap quotes and execution.

## Features

- **Grid Trading**: Automated buy/sell orders within configurable price ranges
- **Profit Banking**: Automatically banks profits in USDG (stablecoin)
- **Moonbag Feature**: Keep a percentage of tokens on sell for potential upside
- **Stop Loss Protection**: Automatic sell when price drops below threshold
- **Dynamic Grid Mode**: Create positions on-demand as price drops (DCA)
- **Auto-Compounding**: Dynamic buy amounts redistribute profits automatically
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
- Small amount of ETH for gas fees

## Quick Start

### 1. Clone and Install

```bash
cd robinhood-grid-bot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

**Minimal configuration** (only 3 required):
```env
PRIVATE_KEY=your_private_key_here
ZEROX_API_KEY=your_0x_api_key_here
GRID_SIZE_USD=10
```

### 3. Build and Run

```bash
npm run build
npm start
```

---

## Configuration Guide

📚 **For detailed configuration options, see [CONFIG.md](CONFIG.md)**

### Configuration Categories

| Category | Key Settings | Description |
|----------|--------------|-------------|
| **Wallet & API** | `PRIVATE_KEY`, `ZEROX_API_KEY` | Authentication and access |
| **Grid Settings** | `GRID_MODE`, `GRID_SIZE_USD`, `MAX_POSITIONS` | How positions are created |
| **Trading** | `PROFIT_THRESHOLD_PERCENT`, `BUY_AMOUNT_MODE` | Profit targets and sizing |
| **Safety** | `STOPLOSS_PERCENTAGE`, `MOONBAG_PERCENTAGE` | Risk management |
| **Timing** | `CHECK_INTERVAL_MS`, `BUY_COOLDOWN_MS` | Execution frequency |

### Grid Modes

| Mode | Description | Best For |
|------|-------------|----------|
| `dynamic` | Create positions on-demand as price drops | **Recommended for most users** |
| `autogenerate` | Create all positions at startup | Full grid deployment |
| `pregenerated` | Load from `positions.json` | Manual control |

### Buy Amount Modes

| Mode | Description | Best For |
|------|-------------|----------|
| `dynamic` | Divide balance by empty positions (auto-compound) | **Recommended** |
| `static` | Fixed amount per position | Predictable sizing |

### Strategy Presets

**Conservative** (Low Risk):
```env
GRID_SIZE_USD=5
MAX_POSITIONS=10
GRID_SPACING_PERCENT=10
PROFIT_THRESHOLD_PERCENT=3
STOPLOSS_PERCENTAGE=-5
```

**Moderate** (Balanced - Default):
```env
GRID_SIZE_USD=10
MAX_POSITIONS=20
GRID_SPACING_PERCENT=5
PROFIT_THRESHOLD_PERCENT=5
STOPLOSS_PERCENTAGE=-10
```

**Aggressive** (High Risk/Reward):
```env
GRID_SIZE_USD=100
MAX_POSITIONS=50
GRID_SPACING_PERCENT=2
PROFIT_THRESHOLD_PERCENT=10
STOPLOSS_PERCENTAGE=-20
```

See [CONFIG.md](CONFIG.md) for complete presets and explanations.

---

## Installation

### Development Mode
```bash
npm run dev
```

### Production Build & Run
```bash
npm run build
npm start
```

### Updating
```bash
git pull
npm install
npm run build
```

---

## Robinhood Chain Specifics

### Why Robinhood Chain?

Robinhood Chain is **optimized for grid trading**:

- **Low Gas Costs**: ~0.0001 ETH per transaction (0.001 ETH reserve handles ~10 trades)
- **Fast Finality**: Transactions confirm in seconds
- **USDG Stablecoin**: Built-in stablecoin for banking profits
- **EVM Compatible**: Use familiar tools (viem, ethers, wagmi)

### Gas Considerations

Default `GAS_RESERVE_ETH=0.001` is sufficient because:
- Robinhood Chain is an L2 with very low gas costs
- Most transactions cost less than $0.01
- 0.001 ETH can cover dozens of trades

### Token Addresses (Chain ID 4663)

```env
USDG_ADDRESS=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
WETH_ADDRESS=0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
```

### RPC Endpoints

```env
# Mainnet
RPC_URL=https://rpc.robinhoodchain.com
CHAIN_ID=4663

# Testnet  
RPC_URL=https://testnet.rpc.robinhoodchain.com
CHAIN_ID=4664
```

---

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
│   ├── bot.log         # All logs
│   ├── error.log       # Errors only
│   └── trades.log      # Trade executions
├── positions.json      # Position storage
├── .env                # Environment variables
├── .env.example        # Example configuration
├── CONFIG.md           # 📚 Detailed configuration guide
├── package.json        # Dependencies
└── tsconfig.json       # TypeScript config
```

---

## How It Works

### Buy Logic
1. Bot checks if current price is within buyMin/buyMax range
2. If within range and under max positions, executes buy via 0x API
3. Stores position with cost basis and targets
4. With `BUY_AMOUNT_MODE=dynamic`, redistributes capital across positions

### Sell Logic
1. Monitors positions against sellMin (profit target)
2. When target reached, executes sell via 0x API
3. If moonbag enabled, keeps specified percentage
4. Updates position or removes if fully sold
5. Profits banked in USDG stablecoin

### Stop Loss
1. Monitors positions against stoploss price
2. If price drops to stoploss, sells entire position
3. Removes position after stop loss execution

### Dynamic Grid Mode
1. Starts with zero positions
2. Creates first position when price drops to entry zone
3. Creates additional positions as price continues dropping
4. Capital efficient - only deploys when needed

---

## Configuration Examples

### Example 1: Conservative Starter
```env
PRIVATE_KEY=0x...
ZEROX_API_KEY=...
GRID_SIZE_USD=5
MAX_POSITIONS=10
GRID_SPACING_PERCENT=10
PROFIT_THRESHOLD_PERCENT=3
STOPLOSS_PERCENTAGE=-5
MOONBAG_PERCENTAGE=20
```

### Example 2: Dynamic Compounding
```env
PRIVATE_KEY=0x...
ZEROX_API_KEY=...
GRID_MODE=dynamic
BUY_AMOUNT_MODE=dynamic
GRID_SIZE_USD=20
MAX_POSITIONS=20
GRID_SPACING_PERCENT=5
PROFIT_THRESHOLD_PERCENT=5
GAS_RESERVE_ETH=0.001
```

### Example 3: Accumulation Mode
```env
PRIVATE_KEY=0x...
ZEROX_API_KEY=...
SELLS_ACTIVE=false
BANK_MOONBAG=false
STOPLOSS_ACTIVE=false
GRID_SIZE_USD=10
MAX_POSITIONS=50
```

---

## Logging

Logs are written to:
- `logs/bot.log` - All logs with timestamps
- `logs/error.log` - Error logs only
- `logs/trades.log` - Trade execution logs
- Console - Colored output for development

### Log Format
```
2026-07-16 01:30:45 [info]: Grid Bot starting...
2026-07-16 01:30:46 [info]: Loaded 5 positions
2026-07-16 01:31:15 [trade]: BUY: 0.05 WETH @ $95.00 (Position #6)
```

---

## Safety Features

- **Stop Loss**: Automatic protection against major losses
- **Max Positions**: Prevents over-leveraging
- **Cooldown Period**: Prevents rapid-fire trading
- **Minimum Profit**: Hard floor prevents selling at loss
- **Token Approval**: Handles ERC20 approvals automatically
- **Retry Logic**: Exponential backoff for API failures
- **Gas Reserve**: Keeps ETH available for transactions

---

## Differences from Python/Solana Version

| Feature | Python/Solana | TypeScript/Robinhood |
|---------|---------------|---------------------|
| Blockchain | Solana | EVM (Robinhood Chain) |
| Swap API | Jupiter Ultra | 0x API |
| Wallet | Solana web3 | viem |
| Stablecoin | USDC | USDG |
| Transactions | Single sig | Gas estimation + signing |
| Balance Checks | getTokenAccountBalance | ERC20 contract calls |
| Gas Costs | ~0.000005 SOL | ~0.0001 ETH |

---

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
- USDG for buying positions
- ETH for gas fees (~0.001 ETH minimum)
- Sufficient balance for grid size

### Transaction Failures
- Check logs in `logs/error.log`
- Verify token approvals
- Ensure sufficient gas (0.001 ETH reserve)

### Bot Not Trading
- Check `BUYS_ACTIVE=true` and `SELLS_ACTIVE=true`
- Verify wallet has USDG balance
- Ensure `GRID_MODE` is set correctly
- Check that price is within buy range

### Common Errors

**"PRIVATE_KEY is required"**
- Set your private key in `.env`

**"Insufficient allowance"**
- Bot will auto-approve tokens on first run
- Or manually approve USDG spending

**"Gas estimation failed"**
- Ensure you have ETH for gas
- Check RPC endpoint is responsive

---

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

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## Resources

- [CONFIG.md](CONFIG.md) - Detailed configuration guide
- [.env.example](.env.example) - All configuration options with comments
- [0x API Docs](https://0x.org/docs) - Swap API documentation
- [viem Docs](https://viem.sh) - Ethereum library documentation
- [Robinhood Chain](https://robinhoodchain.com) - Chain documentation

---

## License

MIT

---

## Disclaimer

This bot is provided as-is for educational purposes. Trading cryptocurrencies involves risk. Always test thoroughly with small amounts before deploying significant capital. Past performance does not guarantee future results.

**Never share your private key. Never commit `.env` files to version control.**
