import assert from "node:assert/strict";
import test from "node:test";

import { MemoryActionStore } from "../src/action-store.js";
import { formatUnits, parseUnits } from "../src/decimal.js";
import { DEFAULT_POLICY, evaluateGuardian, executeGuardian } from "../src/guardian.js";

const observations = {
  network: "Pharos",
  chainId: 1672,
  blockNumber: "20287594",
  observedAt: "2026-10-15T07:25:08.566Z",
  nativeBalanceWei: "0",
  nativeBalance: "0",
  nativeUnit: "PROS",
  tokenBalanceRaw: "123456789012345678901234",
  tokenBalance: "123456789012345678.901234",
  tokenDecimals: 6,
  tokenSymbol: "USDC",
  gasPriceWei: "10000000000",
  gasPriceGwei: "10",
  gasPriceUnit: "gwei",
  mcpEndpoint: "https://mcp.pharos.xyz/mcp",
};

test("decimal parsing and formatting preserve arbitrary precision", () => {
  const value = "123456789012345678901234567890.123456";
  const raw = parseUnits(value, 6);
  assert.equal(raw, 123456789012345678901234567890123456n);
  assert.equal(formatUnits(raw, 6), value);
  assert.throws(() => parseUnits("1.0000001", 6), /at most 6/);
  assert.throws(() => parseUnits("1e6", 6), /decimal string/);
});

test("threshold equality is exact at the boundary", () => {
  const policy = {
    ...DEFAULT_POLICY,
    tokenBalance: { operator: ">=", threshold: "123456789012345678.901234" },
    gasPrice: { operator: "==", threshold: "10" },
  };
  const result = evaluateGuardian(policy, observations);
  assert.equal(result.decision, "FIRE");
  assert.equal(result.traces[1].thresholdRaw, observations.tokenBalanceRaw);
  assert.equal(result.traces[2].thresholdRaw, observations.gasPriceWei);
});

test("all conditions pass and the same run records exactly one action", async () => {
  const store = new MemoryActionStore();
  const run = { runId: "fire-1", policy: DEFAULT_POLICY, readObservations: async () => observations, actionStore: store };
  const first = await executeGuardian(run);
  const retry = await executeGuardian(run);
  assert.equal(first.decision, "FIRE");
  assert.equal(first.action.created, true);
  assert.equal(retry.action.created, false);
  assert.equal((await store.list()).length, 1);
  assert.equal(first.action.actionId, retry.action.actionId);
});

test("one failed condition returns HOLD and creates no action", async () => {
  const store = new MemoryActionStore();
  const policy = { ...DEFAULT_POLICY, native: { operator: ">", threshold: "0" } };
  const result = await executeGuardian({ runId: "hold-1", policy, readObservations: async () => observations, actionStore: store });
  assert.equal(result.decision, "HOLD");
  assert.equal(result.traces.filter((trace) => !trace.pass).length, 1);
  assert.equal(result.action, null);
  assert.equal((await store.list()).length, 0);
});

test("required read failure returns ERROR and creates no action", async () => {
  const store = new MemoryActionStore();
  const result = await executeGuardian({
    runId: "error-1",
    policy: DEFAULT_POLICY,
    readObservations: async () => { throw new Error("MCP timeout"); },
    actionStore: store,
  });
  assert.equal(result.decision, "ERROR");
  assert.equal(result.action, null);
  assert.match(result.error, /MCP timeout/);
  assert.equal((await store.list()).length, 0);
});
