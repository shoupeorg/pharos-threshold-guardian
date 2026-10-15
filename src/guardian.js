import { formatUnits, parseUnits } from "./decimal.js";

export const OPERATORS = [">=", ">", "<=", "<", "==", "!="];

export const DEFAULT_ACCOUNT = "0xC879C018dB60520F4355C26eD1a6D572cdAC1815";
export const DEFAULT_TOKEN = "0xC879C018dB60520F4355C26eD1a6D572cdAC1815";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export const DEFAULT_POLICY = Object.freeze({
  account: DEFAULT_ACCOUNT,
  token: DEFAULT_TOKEN,
  native: { operator: ">=", threshold: "0" },
  tokenBalance: { operator: ">=", threshold: "0" },
  gasPrice: { operator: ">=", threshold: "0" },
});

function copyPolicy(policy) {
  return {
    account: policy.account,
    token: policy.token,
    native: { ...policy.native },
    tokenBalance: { ...policy.tokenBalance },
    gasPrice: { ...policy.gasPrice },
  };
}

function requireCondition(condition, label) {
  if (!condition || typeof condition !== "object") throw new Error(`${label} condition is required`);
  if (!OPERATORS.includes(condition.operator)) throw new Error(`${label} operator is unsupported`);
  if (typeof condition.threshold !== "string") throw new Error(`${label} threshold must be a decimal string`);
  return { operator: condition.operator, threshold: condition.threshold };
}

export function validatePolicy(input) {
  const policy = copyPolicy(input || DEFAULT_POLICY);
  if (!ADDRESS_PATTERN.test(policy.account || "")) throw new Error("Account address is invalid");
  if (!ADDRESS_PATTERN.test(policy.token || "")) throw new Error("Token contract address is invalid");
  policy.native = requireCondition(policy.native, "Native balance");
  policy.tokenBalance = requireCondition(policy.tokenBalance, "Token balance");
  policy.gasPrice = requireCondition(policy.gasPrice, "Gas price");
  return policy;
}

export function compare(left, operator, right) {
  switch (operator) {
    case ">=": return left >= right;
    case ">": return left > right;
    case "<=": return left <= right;
    case "<": return left < right;
    case "==": return left === right;
    case "!=": return left !== right;
    default: throw new Error(`Unsupported operator: ${operator}`);
  }
}

function traceCondition(id, label, observedRaw, decimals, unit, condition) {
  const observed = BigInt(observedRaw);
  const threshold = parseUnits(condition.threshold, decimals, `${label} threshold`);
  return {
    id,
    label,
    observedRaw: observed.toString(),
    observed: formatUnits(observed, decimals),
    unit,
    operator: condition.operator,
    thresholdRaw: threshold.toString(),
    threshold: condition.threshold,
    pass: compare(observed, condition.operator, threshold),
  };
}

export function evaluateGuardian(policyInput, observations) {
  const policy = validatePolicy(policyInput);
  if (!observations || typeof observations !== "object") throw new Error("Observations are required");
  const tokenDecimals = Number(observations.tokenDecimals);
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 255) {
    throw new Error("Token decimals observation is invalid");
  }
  const traces = [
    traceCondition("native-balance", "Native balance", observations.nativeBalanceWei, 18, "PROS", policy.native),
    traceCondition("token-balance", "ERC-20 balance", observations.tokenBalanceRaw, tokenDecimals, observations.tokenSymbol || "TOKEN", policy.tokenBalance),
    traceCondition("gas-price", "Gas price", observations.gasPriceWei, 9, "gwei", policy.gasPrice),
  ];
  return {
    decision: traces.every((trace) => trace.pass) ? "FIRE" : "HOLD",
    policy,
    traces,
  };
}

export async function executeGuardian({ runId, policy, readObservations, actionStore, now = () => new Date() }) {
  if (typeof runId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(runId)) {
    throw new Error("runId must be 1–128 safe identifier characters");
  }
  const validated = validatePolicy(policy);
  const startedAt = now().toISOString();
  try {
    const observations = await readObservations(validated);
    const evaluated = evaluateGuardian(validated, observations);
    const run = {
      runId,
      startedAt,
      completedAt: now().toISOString(),
      network: observations.network,
      chainId: observations.chainId,
      blockNumber: observations.blockNumber,
      mcpEndpoint: observations.mcpEndpoint,
      configuration: evaluated.policy,
      observations,
      traces: evaluated.traces,
      decision: evaluated.decision,
      action: null,
    };
    if (run.decision === "FIRE") {
      run.action = await actionStore.recordOnce(run);
    }
    return run;
  } catch (error) {
    return {
      runId,
      startedAt,
      completedAt: now().toISOString(),
      configuration: validated,
      decision: "ERROR",
      action: null,
      error: error.message || "A required chain read failed",
    };
  }
}
