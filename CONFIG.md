# Robinhood Grid Bot Configuration Guide

A comprehensive guide to configuring the Robinhood Chain Grid Trading Bot for optimal performance.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Configuration Categories](#configuration-categories)
   - [Wallet & API](#wallet--api)
   - [Chain Settings](#chain-settings)
   - [Grid Settings](#grid-settings)
   - [Trading Settings](#trading-settings)
   - [Safety Settings](#safety-settings)
3. [Grid Modes Explained](#grid-modes-explained)
4. [Buy Amount Modes](#buy-amount-modes)
5. [Strategy Presets](#strategy-presets)
6. [Robinhood Chain Specifics](#robinhood-chain-specifics)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Minimal Configuration

For a quick start, you only need to set three variables:

```env
PRIVATE_KEY=your_private_key_here
ZEROX_API_KEY=your_0x_api_key_here
GRID_SIZE_USD=10
```

Everything else uses sensible defaults optimized for Robinhood Chain.

### First Run Checklist

- [ ] Get 0x API key from [0x.org](https://0x.org/)
- [ ] Fund wallet with USDG (for trading) and ETH (for gas)
- [ ] Start with small `GRID_SIZE_USD` ($5-10)
- [ ] Monitor logs for first few trades
- [ ] Adjust settings based on market conditions

---

## Configuration Categories

### Wallet & API

#### `PRIVATE_KEY`
**Required** | Your wallet's private key

- Format: 64 hex characters (with or without `0x` prefix)
- **Security**: Never share or commit this!
- How to get: MetaMask → Account → Export Private Key

#### `ZEROX_API_KEY`
**Required** | API key for 0x swap service

- Get free key at: https://0x.org/
- Used for fetching swap quotes and executing trades
- Rate limits apply based on your plan

---

### Chain Settings

#### `RPC_URL`
**Default**: `https://rpc.robinhoodchain.com`

The RPC endpoint for connecting to Robinhood Chain.

| Network | URL |
|---------|-----|
| Mainnet | `https://rpc.robinhoodchain.com` |
| Testnet | `https://testnet.rpc.robinhoodchain.com` |

#### `CHAIN_ID`
**Default**: `4663`

The chain ID for Robinhood Chain.

| Network | Chain ID |
|---------|----------|
| Mainnet | 4663 |
| Testnet | 4664 |

#### Token Addresses

**Default USDG**: `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`
**Default WETH**: `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`

These are the official token addresses on Robinhood Chain. Only change if you know what you're doing.

---

### Grid Settings

#### `GRID_MODE`
**Default**: `dynamic`

Determines how grid positions are created.

| Mode | Description | Best For |
|------|-------------|----------|
| `pregenerated` | Load from `positions.json` | Manual control, custom levels |
| `autogenerate` | Create all at startup | Full grid deployment |
| `dynamic` | Create on-demand as price drops | DCA, trending markets |

**Recommendation**: Use `dynamic` for most strategies. It capitalizes on dips without tying up capital in unused grid levels.

#### `BUY_AMOUNT_MODE`
**Default**: `dynamic`

Determines how buy amounts are calculated.

| Mode | Description | Best For |
|------|-------------|----------|
| `static` | Fixed amount per position | Predictable sizing, beginners |
| `dynamic` | Divide balance by positions | Auto-compounding, advanced |

**Dynamic Mode Example**:
- You have $1000 and 10 empty positions
- Each buy uses ~$100 (minus gas reserve)
- After a $50 profit, next buy uses ~$105
- Compounds automatically!

#### `GRID_SIZE_USD`
**Default**: `10`

Amount in USD to spend per grid position.

| Strategy | Size | Capital Needed (20 positions) |
|----------|------|------------------------------|
| Conservative | $5-10 | $100-200 |
| Moderate | $20-50 | $400-1000 |
| Aggressive | $100+ | $2000+ |

**Note**: With `BUY_AMOUNT_MODE=dynamic`, this becomes the initial target, and amounts adjust based on available capital.

#### `MAX_POSITIONS`
**Default**: `20`

Maximum number of simultaneous grid positions.

| Value | Spacing | Best For |
|-------|---------|----------|
| 10 | Wide | Volatile assets, less capital |
| 20 | Medium | Balanced approach |
| 50+ | Fine | Stable assets, more capital |

#### `GRID_SPACING_PERCENT`
**Default**: `5`

Percentage distance between grid levels.

- 5% spacing with positions at $100, $95, $90.25, etc.
- **Conservative**: 10% (fewer trades, bigger moves)
- **Moderate**: 5% (balanced)
- **Aggressive**: 2-3% (more trades, smaller moves)

---

### Trading Settings

#### `PROFIT_THRESHOLD_PERCENT`
**Default**: `5`

Target profit percentage per grid level.

- 5% = Sell when position gains 5%
- Higher values = fewer wins but bigger profits
- Lower values = more frequent trades

#### `MIN_PROFIT`
**Default**: `1.05`

Minimum profit multiplier (hard floor for sells).

- 1.05 = Never sell below 5% profit
- Should be slightly higher than `PROFIT_THRESHOLD_PERCENT` to account for fees
- Prevents selling at a loss due to slippage

#### `BANK_MIN_AMOUNT`
**Default**: `1.0`

Minimum USD amount to bank as profit.

- Prevents "dust" transactions
- Saves gas on tiny profits
- Set based on your `GRID_SIZE_USD`

#### `BANK_PROFIT`
**Default**: `true`

Enable profit banking to USDG stablecoin.

- `true`: Profits converted to USDG (stable)
- `false`: Profits stay in traded token

#### `SELLS_ACTIVE` / `BUYS_ACTIVE`
**Default**: `true`

Toggle trading directions.

- Both `true`: Normal grid trading
- `BUYS_ACTIVE=false`: Wind down mode (sell only)
- `SELLS_ACTIVE=false`: Accumulation mode (buy only)

---

### Safety Settings

#### `BANK_MOONBAG`
**Default**: `true`

Enable moonbag feature (keep tokens on sell).

#### `MOONBAG_PERCENTAGE`
**Default**: `10`

Percentage of tokens to keep when selling.

- 10% = Sell 90%, keep 10%
- Captures upside if price continues rising
- Higher values = more upside protection

#### `STOPLOSS_ACTIVE`
**Default**: `true`

Enable automatic stop loss.

#### `STOPLOSS_PERCENTAGE`
**Default**: `-10`

Maximum loss before auto-sell.

- Must be NEGATIVE (e.g., `-10` for 10% loss)
- Position fully liquidated when hit
- Set based on your risk tolerance

| Risk Level | Stop Loss |
|------------|-----------|
| Conservative | -5% to -10% |
| Moderate | -10% to -15% |
| Aggressive | -20% or disable |

---

### Timing Settings

#### `CHECK_INTERVAL_MS`
**Default**: `10000` (10 seconds)

How often to scan for trading opportunities.

- Robinhood Chain has fast finality
- Shorter intervals = faster response
- Longer intervals = less API usage

#### `BUY_COOLDOWN_MS`
**Default**: `30000` (30 seconds)

Minimum time between buy executions.

- Prevents rapid-fire buying during volatility
- Gives price time to stabilize
- Adjust based on market conditions

---

### Gas Settings

#### `GAS_RESERVE_ETH`
**Default**: `0.001`

Amount of ETH to reserve for gas fees.

- Only used with `BUY_AMOUNT_MODE=dynamic`
- Robinhood Chain gas is very cheap
- 0.001 ETH is sufficient for many transactions

---

## Grid Modes Explained

### Dynamic Mode (Recommended)

```env
GRID_MODE=dynamic
```

**How it works**:
1. Bot starts with zero positions
2. When price drops, creates first buy level
3. Creates next level when price drops further
4. Sells when profit target reached
5. Removes position after sell

**Pros**:
- Capital efficient (only deploys when needed)
- Naturally DCA's on dips
- Works well in trending markets

**Cons**:
- May miss opportunities in sideways markets
- Requires price movement to start

### Autogenerate Mode

```env
GRID_MODE=autogenerate
```

**How it works**:
1. Bot calculates all grid levels at startup
2. Creates positions from current price downward
3. All positions ready immediately

**Pros**:
- Captures all price movements immediately
- Predictable position sizing

**Cons**:
- Ties up capital in unused positions
- Less flexible

### Pregenerated Mode

```env
GRID_MODE=pregenerated
```

**How it works**:
1. Bot loads positions from `positions.json`
2. Uses your custom price levels
3. Manual control over grid structure

**Pros**:
- Full control over price levels
- Can optimize for specific ranges

**Cons**:
- Requires manual position file management
- Less automated

---

## Buy Amount Modes

### Static Mode

```env
BUY_AMOUNT_MODE=static
GRID_SIZE_USD=10
```

Every buy uses exactly $10 (or your configured amount).

**Best for**: Beginners, predictable sizing

### Dynamic Mode (Recommended)

```env
BUY_AMOUNT_MODE=dynamic
```

Buy amount = (Available Balance - Gas Reserve) / Empty Positions

**Example**:
```
Starting: $1000, 20 empty positions
First buy: $1000 / 20 = $50 per position
After $100 profit: $1100 / 19 = ~$58 per position
After 5 sells: Profits redistributed to remaining positions
```

**Best for**: Auto-compounding, maximizing capital efficiency

---

## Strategy Presets

### Conservative (Low Risk)

```env
GRID_MODE=dynamic
BUY_AMOUNT_MODE=dynamic
GRID_SIZE_USD=5
MAX_POSITIONS=10
GRID_SPACING_PERCENT=10
PROFIT_THRESHOLD_PERCENT=3
MIN_PROFIT=1.03
MOONBAG_PERCENTAGE=20
STOPLOSS_PERCENTAGE=-5
CHECK_INTERVAL_MS=30000
BUY_COOLDOWN_MS=60000
```

**Characteristics**:
- Wide 10% grid spacing (fewer trades)
- 3% profit target (higher win rate)
- Tight 5% stop loss (limits downside)
- 20% moonbag (more upside capture)
- Slower check intervals (less active)

**Best for**: Conservative investors, volatile markets, beginners

---

### Moderate (Balanced)

```env
GRID_MODE=dynamic
BUY_AMOUNT_MODE=dynamic
GRID_SIZE_USD=20
MAX_POSITIONS=20
GRID_SPACING_PERCENT=5
PROFIT_THRESHOLD_PERCENT=5
MIN_PROFIT=1.05
MOONBAG_PERCENTAGE=10
STOPLOSS_PERCENTAGE=-10
CHECK_INTERVAL_MS=10000
BUY_COOLDOWN_MS=30000
```

**Characteristics**:
- 5% grid spacing (balanced trades)
- 5% profit target (moderate returns)
- 10% stop loss (moderate protection)
- 10% moonbag (balanced upside)
- 10-second checks (responsive)

**Best for**: Most traders, balanced approach

---

### Aggressive (High Risk/High Reward)

```env
GRID_MODE=autogenerate
BUY_AMOUNT_MODE=static
GRID_SIZE_USD=100
MAX_POSITIONS=50
GRID_SPACING_PERCENT=2
PROFIT_THRESHOLD_PERCENT=10
MIN_PROFIT=1.10
MOONBAG_PERCENTAGE=5
STOPLOSS_PERCENTAGE=-20
CHECK_INTERVAL_MS=5000
BUY_COOLDOWN_MS=10000
```

**Characteristics**:
- Tight 2% spacing (many trades)
- 10% profit target (bigger wins)
- Wide 20% stop loss (allows volatility)
- 5% moonbag (mostly sell all)
- 5-second checks (very active)

**Best for**: Experienced traders, stable markets, high capital

---

### Testing (Paper Trading)

```env
GRID_MODE=dynamic
BUY_AMOUNT_MODE=static
GRID_SIZE_USD=1
MAX_POSITIONS=5
GRID_SPACING_PERCENT=5
PROFIT_THRESHOLD_PERCENT=5
MIN_PROFIT=1.05
SELLS_ACTIVE=false
STOPLOSS_ACTIVE=false
CHECK_INTERVAL_MS=10000
```

**Characteristics**:
- $1 position size (minimal risk)
- Sells disabled (accumulation only)
- Stop loss disabled (no forced sells)
- Test buying logic safely

**Best for**: Testing, learning the bot

---

## Robinhood Chain Specifics

### Why Robinhood Chain?

Robinhood Chain is optimized for grid trading:

1. **Low Gas Costs**: ~0.0001 ETH per transaction
2. **Fast Finality**: Transactions confirm in seconds
3. **USDG Stablecoin**: Built-in stablecoin for banking profits
4. **EVM Compatible**: Use familiar tools (viem, ethers)

### Gas Considerations

```env
GAS_RESERVE_ETH=0.001
```

With 0.001 ETH reserve:
- At ~0.0001 ETH per transaction
- Can execute ~10 transactions
- Sufficient for most grid operations

### RPC Endpoints

**Mainnet**: `https://rpc.robinhoodchain.com`
- For live trading
- Real funds
- Production environment

**Testnet**: `https://testnet.rpc.robinhoodchain.com`
- For testing
- Free test tokens
- Safe experimentation

### Token Pairs

Default pair: **USDG/WETH**

- **USDG**: Robinhood's USD-backed stablecoin
- **WETH**: Wrapped ETH for trading

You can configure other pairs by changing token addresses.

---

## Troubleshooting

### Configuration Errors

**"PRIVATE_KEY is required"**
- Set your private key in `.env`
- Ensure it doesn't have extra spaces

**"ZEROX_API_KEY is required"**
- Get free key from 0x.org
- Add to `.env` file

**"MOONBAG_PERCENTAGE must be between 0 and 100"**
- Ensure value is a valid percentage
- No decimals (use 10, not 10.5)

**"STOPLOSS_PERCENTAGE must be negative"**
- Use negative number (e.g., -10)
- Represents loss percentage

### Performance Issues

**Bot not trading**
- Check `BUYS_ACTIVE=true` and `SELLS_ACTIVE=true`
- Verify wallet has USDG balance
- Ensure sufficient ETH for gas
- Check logs for errors

**Too many/few trades**
- Adjust `GRID_SPACING_PERCENT`
- Wider spacing = fewer trades
- Tighter spacing = more trades

**Positions not selling**
- Check `PROFIT_THRESHOLD_PERCENT`
- Ensure `MIN_PROFIT` is reasonable
- Verify token has sufficient liquidity

### Best Practices

1. **Start Small**: Begin with $5-10 grid sizes
2. **Monitor Initially**: Watch first few trades closely
3. **Adjust Gradually**: Change one setting at a time
4. **Keep Logs**: Review `logs/trades.log` regularly
5. **Stay Funded**: Ensure adequate USDG and ETH balances

---

## Advanced Configuration

### Custom Position File (Pregenerated Mode)

Create `positions.json`:

```json
[
  {
    "balance": "0",
    "cost": "0",
    "buyMin": "90",
    "buyMax": "100",
    "sellMin": "105",
    "stoploss": "85",
    "tokenAddress": "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    "symbol": "WETH",
    "createdAt": 0,
    "lastBuyAt": 0
  }
]
```

### Environment-Specific Configs

Create multiple `.env` files:

```bash
.env.production  # Live trading
.env.testnet     # Testnet testing
.env.conservative # Conservative strategy
```

Load with:
```bash
cp .env.production .env && npm start
```

---

## Support

For issues and questions:
- Check logs in `logs/` directory
- Review this configuration guide
- Examine `.env.example` for all options

---

*Last updated: July 2026*
*Version: 1.0.0*
