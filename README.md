# Pharos Threshold Guardian

A reusable Skill and compact web guardian for the Pharos Agent Arena **Threshold Guardian** task. It evaluates three configurable conditions from live Pharos Pacific Mainnet reads and performs one safe, persistent off-chain action only when all conditions pass.

- Demo: `https://pharos-threshold-guardian.shoupeorg.workers.dev`
- Official Chain MCP: `https://mcp.pharos.xyz/mcp` (Streamable HTTP)
- Official Skill instructions: [AI.PHAROS Skill Engine](https://ai.pharos.xyz/skill-engine)
- Token: `0xC879C018dB60520F4355C26eD1a6D572cdAC1815`
- Token source: [PharosNetwork official Token List](https://github.com/PharosNetwork/Token-List/blob/main/tokenlist.json)

## Install and run locally

Requires Node.js 20+ and npm.

```sh
npm install
npm run check
npm run mcp:probe
npm run dev
```

The local Worker uses the D1 binding configured by Wrangler. Apply migrations before using a fresh deployment:

```sh
npx wrangler d1 migrations apply pharos-threshold-guardian-actions --remote
```

## Reusable Skill

The repository root contains [`SKILL.md`](./SKILL.md), following the official AI.PHAROS Skill Engine pattern: YAML metadata followed by operational instructions, optional supporting scripts, and references. Install with:

```sh
npx skills add https://github.com/shoupeorg/pharos-threshold-guardian
```

Invoke from the installed Skill directory:

```sh
node scripts/invoke-skill.mjs --run-id=review-001 \
  --account=0xC879C018dB60520F4355C26eD1a6D572cdAC1815 \
  --token=0xC879C018dB60520F4355C26eD1a6D572cdAC1815 \
  --native-op='>=' --native=0 \
  --token-op='>=' --token-threshold=0 \
  --gas-op='>=' --gas=0
```

Installing is not required to use the web demo. No wallet, private key, signing, or transaction capability is used.

## MCP reads

The application connects with the official Model Context Protocol TypeScript SDK and lists tools before each run. It requires only these verified read-only Chain MCP tools:

| Tool | Purpose |
| --- | --- |
| `get_chain_info` | Verify Pharos chain ID `1672` and capture the latest block. |
| `get_balance` | Read native PROS balance at that explicit block. |
| `eth_call` | Read `decimals()`, `symbol()`, and `balanceOf(address)` at that same block. |
| `get_gas_price` | Read the current gas price. |

There is no direct-RPC fallback, cached observation fallback, or mock observation in production.

## Decision rules and exact units

- Native thresholds are decimal PROS strings and are parsed to wei with 18 decimals.
- Token thresholds use the ERC-20 decimals returned by the contract.
- Gas thresholds are decimal gwei strings and are parsed to wei with 9 decimals.
- Operators: `>=`, `>`, `<=`, `<`, `==`, and `!=`.
- All comparisons use `BigInt`; observed values and thresholds never pass through JavaScript `Number`.
- `FIRE` requires all three traces to pass.
- Any failed trace returns `HOLD`.
- A failed, timed-out, missing, or invalid required read returns `ERROR / NO ACTION`; failed reads are never converted to zero.

## Record action

`FIRE` appends a structured **Record action** row to Cloudflare D1. It contains the run ID, timestamp, configuration, observations, traces, decision, and deterministic action ID. A unique database constraint on `run_id` makes retries idempotent. `HOLD` and `ERROR` never write a row. This action is off-chain and sends no transaction.

## Web demo

1. Enter a public account and ERC-20 token contract.
2. Select each comparison operator and threshold.
3. Choose **Run Guardian**.
4. Inspect the pinned block, complete three-condition trace, final decision, and persistent action history.

The **FIRE POLICY** and **HOLD POLICY** buttons change only configurable policy values. Every run fetches fresh observations through MCP, so a preset outcome is not guaranteed if chain state changes.

## Real demonstration evidence

Recorded on 2026-10-15 through the deployed API and official Chain MCP. These are snapshots, not promises about future chain state. The same public account/token address was used in both runs; only the native-balance operator changed.

### FIRE snapshot

- Run: `demo-fire-20261015T0735Z`
- Block: `20288204`
- Observations: `0 PROS`, `0 USDC` (6 decimals), `10 gwei`
- Policy: native `>= 0`, token `>= 0`, gas `>= 0`
- Trace: all three passed
- Decision: `FIRE`
- Action: `record-demo-fire-20261015T0735Z` (`Record action`, created once)
- Retry with the same run ID returned `created: false`; history still contained exactly one action.

### HOLD snapshot

- Run: `demo-hold-20261015T0735Z`
- Block: `20288216`
- Observations: `0 PROS`, `0 USDC` (6 decimals), `10 gwei`
- Policy: native `> 0`, token `>= 0`, gas `>= 0`
- Trace: native failed; token and gas passed
- Decision: `HOLD`
- Action: none; persistent history remained at one record.

Full structured evidence is saved in [`evidence/fire.json`](./evidence/fire.json) and [`evidence/hold.json`](./evidence/hold.json). The different block numbers reflect two fresh live runs; the observed values remained the same while only the configurable policy changed.

## Verification

`npm run check` covers:

- all conditions pass and exactly one action is created;
- retrying the same run ID does not duplicate its action;
- one failed condition creates no action;
- required read failure creates no action; and
- exact decimal parsing, formatting, and threshold boundaries.

The deployed interface was also exercised with live MCP reads: FIRE displayed three passing traces and appended one action; HOLD displayed one failed and two passing traces and appended none. A deployed invalid-contract run returned `ERROR`, `action: null`, and left the action count unchanged. The Skill package was discovered successfully with `npx skills add . --list`; it was not installed into the host.

## Limitations

- The hosted Pharos MCP has a documented rate limit of 120 requests per minute per IP.
- Gas price is a current MCP observation; unlike balance and contract reads, `get_gas_price` has no block parameter.
- The action log is an application record, not an on-chain transaction or proof.
- Public chain values can change, so demonstration thresholds establish outcomes only for their recorded runs.
