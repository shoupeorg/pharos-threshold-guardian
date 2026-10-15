function actionFromRun(run) {
  const actionId = `record-${run.runId}`;
  return {
    actionId,
    type: "Record action",
    runId: run.runId,
    recordedAt: run.completedAt,
    configuration: run.configuration,
    observations: run.observations,
    traces: run.traces,
    decision: run.decision,
  };
}

export class D1ActionStore {
  constructor(database) {
    if (!database) throw new Error("Persistent action database is unavailable");
    this.database = database;
  }

  async recordOnce(run) {
    const record = actionFromRun(run);
    const result = await this.database.prepare(
      "INSERT OR IGNORE INTO action_records (action_id, run_id, created_at, payload_json) VALUES (?, ?, ?, ?)",
    ).bind(record.actionId, record.runId, record.recordedAt, JSON.stringify(record)).run();
    const stored = await this.database.prepare(
      "SELECT payload_json FROM action_records WHERE run_id = ?",
    ).bind(record.runId).first();
    if (!stored?.payload_json) throw new Error("Action record could not be confirmed");
    return { ...JSON.parse(stored.payload_json), created: Number(result.meta?.changes || 0) === 1 };
  }

  async list(limit = 25) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 25));
    const result = await this.database.prepare(
      "SELECT payload_json FROM action_records ORDER BY created_at DESC LIMIT ?",
    ).bind(safeLimit).all();
    return (result.results || []).map((row) => JSON.parse(row.payload_json));
  }
}

export class MemoryActionStore {
  constructor() { this.records = new Map(); }

  async recordOnce(run) {
    if (this.records.has(run.runId)) return { ...this.records.get(run.runId), created: false };
    const record = actionFromRun(run);
    this.records.set(run.runId, record);
    return { ...record, created: true };
  }

  async list() { return [...this.records.values()].reverse(); }
}
