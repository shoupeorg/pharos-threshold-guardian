---
name: pharos-threshold-guardian
description: Evaluate configurable native balance, ERC-20 balance, and gas-price thresholds on Pharos Pacific Mainnet. Use when a user asks for a three-condition on-chain guard, an all-pass FIRE/HOLD decision, an auditable condition trace, or a safe off-chain action record. All chain reads go through the official Pharos Chain MCP; the skill never requests a wallet or sends a transaction.
version: 1.0.0
requires:
  anyBins:
    - node
---

# Pharos Threshold Guardian

Run a reusable, read-only Pharos guardian with three independent live conditions:

1. native PROS balance for a configured account;
2. ERC-20 `balanceOf(account)` with contract-provided decimals; and
3. current chain gas price.

The decision is `FIRE` only when all three comparisons pass. Any failed comparison is `HOLD`. A missing, timed-out, or invalid read is `ERROR / NO ACTION`. Only `FIRE` performs the concrete action **Record action**, which appends one idempotent structured record to the deployed server-side action log. The action is off-chain and sends no transaction.

## Install

Install this repository using the command documented by AI.PHAROS Skill Engine:

```sh
npx skills add https://github.com/shoupeorg/pharos-threshold-guardian
```

This repository uses the officially demonstrated root `SKILL.md` package layout. Installing it copies the Skill instructions; it does not configure a wallet, request a private key, or claim a platform installation until that command actually completes.

## Invoke

From the installed Skill directory, use the included helper. Every value is a non-negative decimal string in the displayed unit:

```sh
node scripts/invoke-skill.mjs \
  --run-id=review-001 \
  --account=0xC879C018dB60520F4355C26eD1a6D572cdAC1815 \
  --token=0xC879C018dB60520F4355C26eD1a6D572cdAC1815 \
  --native-op='>=' --native=0 \
  --token-op='>=' --token-threshold=0 \
  --gas-op='>=' --gas=0
```

Supported operators are `>=`, `>`, `<=`, `<`, `==`, and `!=`.

- `--native` is in PROS (18 decimals).
- `--token-threshold` is in the token unit returned by `symbol()` and uses decimals returned by `decimals()`.
- `--gas` is in gwei (9 decimals).
- `--run-id` is the idempotency key. Retrying it returns the existing action rather than appending another record.

The helper calls the deployed guardian API. Override its base URL only for a trusted deployment with `PHAROS_GUARDIAN_URL`.

## Agent procedure

1. Confirm that the user supplied a valid public account and ERC-20 contract address. Never request a private key.
2. Keep every threshold as the original decimal string. Never convert balances or gas prices to JavaScript `Number`.
3. Run `scripts/invoke-skill.mjs` once with a unique `run-id`.
4. Report the network, chain ID, pinned block, each observation/operator/threshold/pass result, final decision, and action ID when present.
5. If the decision is `ERROR`, report the error and explicitly state that no action was recorded. Never reuse stale observations as a fresh result.

## Official integrations

- Skill format and install command: [AI.PHAROS Skill Engine](https://ai.pharos.xyz/skill-engine)
- Chain MCP endpoint: `https://mcp.pharos.xyz/mcp` (Streamable HTTP)
- Required read-only tools: `get_chain_info`, `get_balance`, `get_gas_price`, and `eth_call`
- Chain: Pharos Pacific Mainnet, chain ID `1672`

The hosted MCP is rate-limited. Do not retry in a tight loop; surface timeouts and temporary failures as `ERROR / NO ACTION`.
