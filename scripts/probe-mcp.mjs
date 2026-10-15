import { DEFAULT_POLICY } from "../src/guardian.js";
import { listRelevantTools, readGuardianObservations } from "../src/pharos-mcp.js";

const tools = await listRelevantTools();
const observations = await readGuardianObservations(DEFAULT_POLICY);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), tools, observations }, null, 2));
