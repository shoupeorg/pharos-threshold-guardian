import { D1ActionStore } from "./action-store.js";
import { DEFAULT_POLICY, executeGuardian, validatePolicy } from "./guardian.js";
import { MCP_URL, readGuardianObservations } from "./pharos-mcp.js";

const headers = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const json = (data, status = 200) => Response.json(data, { status, headers });

async function parseBody(request) {
  const length = Number(request.headers.get("content-length") || "0");
  if (length > 20000) throw new Error("Request body is too large");
  try { return await request.json(); } catch { throw new Error("Request body must be valid JSON"); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/config") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      return json({
        network: "Pharos",
        chainId: 1672,
        mcpEndpoint: MCP_URL,
        defaultPolicy: DEFAULT_POLICY,
        action: "Record action (off-chain; no transaction)",
      });
    }
    if (url.pathname === "/api/run") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try {
        const body = await parseBody(request);
        const policy = validatePolicy(body.policy);
        const runId = body.runId || crypto.randomUUID();
        const run = await executeGuardian({
          runId,
          policy,
          readObservations: readGuardianObservations,
          actionStore: new D1ActionStore(env.DB),
        });
        return json(run, run.decision === "ERROR" ? 502 : 200);
      } catch (error) {
        return json({ decision: "ERROR", action: null, error: error.message || "Guardian request failed" }, 400);
      }
    }
    if (url.pathname === "/api/actions") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      try {
        const actions = await new D1ActionStore(env.DB).list(url.searchParams.get("limit"));
        return json({ actions });
      } catch (error) {
        return json({ error: error.message || "Action history failed" }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
