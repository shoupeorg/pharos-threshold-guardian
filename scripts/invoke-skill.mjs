import process from "node:process";

const endpoint = process.env.PHAROS_GUARDIAN_URL || "https://pharos-threshold-guardian.shoupeorg.workers.dev";
const args = Object.fromEntries(process.argv.slice(2).map((entry) => {
  const [key, ...rest] = entry.replace(/^--/, "").split("=");
  return [key, rest.join("=")];
}));

const policy = {
  account: args.account || "0xC879C018dB60520F4355C26eD1a6D572cdAC1815",
  token: args.token || "0xC879C018dB60520F4355C26eD1a6D572cdAC1815",
  native: { operator: args["native-op"] || ">=", threshold: args.native || "0" },
  tokenBalance: { operator: args["token-op"] || ">=", threshold: args["token-threshold"] || "0" },
  gasPrice: { operator: args["gas-op"] || ">=", threshold: args.gas || "0" },
};
const runId = args["run-id"] || `skill-${Date.now()}`;

const response = await fetch(`${endpoint}/api/run`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ runId, policy }),
  signal: AbortSignal.timeout(70000),
});
const result = await response.json();
console.log(JSON.stringify(result, null, 2));
if (!response.ok || result.decision === "ERROR") process.exitCode = 1;
