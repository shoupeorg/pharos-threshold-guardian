import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { formatUnits } from "./decimal.js";

export const MCP_URL = "https://mcp.pharos.xyz/mcp";
export const REQUIRED_TOOLS = ["get_chain_info", "get_balance", "get_gas_price", "eth_call"];
const DECIMALS_SELECTOR = "0x313ce567";
const SYMBOL_SELECTOR = "0x95d89b41";
const BALANCE_OF_SELECTOR = "0x70a08231";

function textPayload(result, toolName) {
  if (result.isError) {
    const detail = result.content?.filter((item) => item.type === "text").map((item) => item.text).join("\n");
    throw new Error(`${toolName} failed${detail ? `: ${detail}` : ""}`);
  }
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error(`${toolName} returned no text result`);
  try { return JSON.parse(text); } catch { throw new Error(`${toolName} returned invalid JSON`); }
}

async function callJson(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  return textPayload(result, name);
}

function decodeUint256(result, label) {
  if (typeof result !== "string" || !/^0x[0-9a-f]{64}$/i.test(result)) {
    throw new Error(`${label} returned invalid ABI data`);
  }
  return BigInt(result);
}

function decodeString(result) {
  if (typeof result !== "string" || !/^0x[0-9a-f]*$/i.test(result)) return "TOKEN";
  const hex = result.slice(2);
  try {
    if (hex.length === 64) {
      return new TextDecoder().decode(Uint8Array.from(hex.match(/../g).map((part) => Number.parseInt(part, 16)))).replace(/\0+$/, "") || "TOKEN";
    }
    if (hex.length >= 128) {
      const length = Number(BigInt(`0x${hex.slice(64, 128)}`));
      const data = hex.slice(128, 128 + length * 2);
      return new TextDecoder().decode(Uint8Array.from(data.match(/../g)?.map((part) => Number.parseInt(part, 16)) || [])) || "TOKEN";
    }
  } catch {}
  return "TOKEN";
}

function encodeBalanceOf(address) {
  return `${BALANCE_OF_SELECTOR}${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

export async function withPharosClient(operation, { timeoutMs = 25000 } = {}) {
  const client = new Client({ name: "pharos-threshold-guardian", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    fetch: (input, init) => fetch(input, {
      ...init,
      signal: AbortSignal.any([...(init?.signal ? [init.signal] : []), AbortSignal.timeout(timeoutMs)]),
    }),
  });
  let connected = false;
  try {
    await client.connect(transport);
    connected = true;
    return await operation(client);
  } finally {
    if (connected) {
      try { await transport.terminateSession(); } catch {}
      await client.close();
    }
  }
}

export async function listRelevantTools() {
  return withPharosClient(async (client) => {
    const { tools } = await client.listTools();
    return tools.filter((tool) => REQUIRED_TOOLS.includes(tool.name));
  });
}

export async function readGuardianObservations(policy) {
  return withPharosClient(async (client) => {
    const { tools } = await client.listTools();
    const available = new Set(tools.map((tool) => tool.name));
    const missing = REQUIRED_TOOLS.filter((name) => !available.has(name));
    if (missing.length) throw new Error(`Pharos MCP is missing required tools: ${missing.join(", ")}`);

    const chain = await callJson(client, "get_chain_info");
    if (chain.chainId !== 1672) throw new Error(`Expected Pharos chain ID 1672, received ${chain.chainId}`);
    const blockNumber = String(chain.latestBlock);
    if (!/^\d+$/.test(blockNumber)) throw new Error("get_chain_info returned an invalid block number");

    const [native, decimalsCall, symbolCall, balanceCall, gas] = await Promise.all([
      callJson(client, "get_balance", { address: policy.account, block: blockNumber }),
      callJson(client, "eth_call", { transaction: { to: policy.token, data: DECIMALS_SELECTOR }, block: blockNumber }),
      callJson(client, "eth_call", { transaction: { to: policy.token, data: SYMBOL_SELECTOR }, block: blockNumber }),
      callJson(client, "eth_call", { transaction: { to: policy.token, data: encodeBalanceOf(policy.account) }, block: blockNumber }),
      callJson(client, "get_gas_price"),
    ]);

    if (typeof native.balanceWei !== "string" || !/^\d+$/.test(native.balanceWei)) throw new Error("get_balance returned invalid balanceWei");
    if (typeof gas.gasPriceWei !== "string" || !/^\d+$/.test(gas.gasPriceWei)) throw new Error("get_gas_price returned invalid gasPriceWei");
    const decimalsRaw = decodeUint256(decimalsCall.result, "decimals()");
    if (decimalsRaw > 255n) throw new Error("decimals() is out of range");
    const tokenDecimals = Number(decimalsRaw);
    const tokenBalance = decodeUint256(balanceCall.result, "balanceOf()");
    const gasPrice = BigInt(gas.gasPriceWei);

    return {
      network: chain.name || "Pharos",
      chainId: chain.chainId,
      blockNumber,
      observedAt: new Date().toISOString(),
      account: policy.account,
      token: policy.token,
      nativeBalanceWei: native.balanceWei,
      nativeBalance: formatUnits(BigInt(native.balanceWei), 18),
      nativeUnit: native.symbol || "PROS",
      tokenBalanceRaw: tokenBalance.toString(),
      tokenBalance: formatUnits(tokenBalance, tokenDecimals),
      tokenDecimals,
      tokenSymbol: decodeString(symbolCall.result),
      gasPriceWei: gasPrice.toString(),
      gasPriceGwei: formatUnits(gasPrice, 9),
      gasPriceUnit: "gwei",
      mcpEndpoint: MCP_URL,
      reads: [
        { tool: "get_chain_info", block: blockNumber },
        { tool: "get_balance", block: blockNumber },
        { tool: "eth_call", method: "decimals()", block: blockNumber },
        { tool: "eth_call", method: "symbol()", block: blockNumber },
        { tool: "eth_call", method: "balanceOf(address)", block: blockNumber },
        { tool: "get_gas_price", block: "current" },
      ],
    };
  });
}
