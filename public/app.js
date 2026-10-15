'use strict';

const OPERATORS = ['>=', '>', '<=', '<', '==', '!='];
const ids = (id) => document.getElementById(id);
const elements = {
  account: ids('account'), token: ids('token'), nativeOp: ids('native-op'), nativeThreshold: ids('native-threshold'),
  tokenOp: ids('token-op'), tokenThreshold: ids('token-threshold'), gasOp: ids('gas-op'), gasThreshold: ids('gas-threshold'),
  run: ids('run'), firePreset: ids('fire-preset'), holdPreset: ids('hold-preset'), connection: ids('connection'),
  runId: ids('run-id'), block: ids('block'), decision: ids('decision'), traces: ids('traces'), error: ids('error'),
  traceSummary: ids('trace-summary'), actions: ids('actions'), systemStatus: ids('system-status'), actionStatus: ids('action-status'),
};

for (const select of [elements.nativeOp, elements.tokenOp, elements.gasOp]) {
  for (const operator of OPERATORS) {
    const option = document.createElement('option');
    option.value = option.textContent = operator;
    select.append(option);
  }
}

function setStatus(label, state = 'idle') {
  elements.connection.textContent = label;
  elements.connection.dataset.state = state;
  elements.systemStatus.textContent = `SYSTEM ${label}`;
}

function applyPolicy(policy) {
  elements.account.value = policy.account;
  elements.token.value = policy.token;
  elements.nativeOp.value = policy.native.operator;
  elements.nativeThreshold.value = policy.native.threshold;
  elements.tokenOp.value = policy.tokenBalance.operator;
  elements.tokenThreshold.value = policy.tokenBalance.threshold;
  elements.gasOp.value = policy.gasPrice.operator;
  elements.gasThreshold.value = policy.gasPrice.threshold;
}

function currentPolicy() {
  return {
    account: elements.account.value.trim(), token: elements.token.value.trim(),
    native: { operator: elements.nativeOp.value, threshold: elements.nativeThreshold.value.trim() },
    tokenBalance: { operator: elements.tokenOp.value, threshold: elements.tokenThreshold.value.trim() },
    gasPrice: { operator: elements.gasOp.value, threshold: elements.gasThreshold.value.trim() },
  };
}

function text(tag, value, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function renderTraces(traces = []) {
  elements.traces.replaceChildren();
  if (!traces.length) {
    const empty = text('div', '', 'empty-state');
    empty.append(text('strong', 'NO TRACE AVAILABLE'), text('span', 'A required chain read did not complete.'));
    elements.traces.append(empty);
    return;
  }
  for (const trace of traces) {
    const card = document.createElement('article');
    card.className = `trace-card${trace.pass ? '' : ' fail'}`;
    const head = text('div', '', 'trace-head');
    head.append(text('b', trace.label.toUpperCase()), text('span', trace.pass ? 'PASS' : 'FAIL'));
    const expression = text('div', `${trace.observed} ${trace.operator} ${trace.threshold}`, 'trace-expression');
    const details = document.createElement('dl');
    for (const [label, value] of [['OBSERVED', `${trace.observed} ${trace.unit}`], ['OPERATOR', trace.operator], ['THRESHOLD', `${trace.threshold} ${trace.unit}`], ['RAW OBSERVED', trace.observedRaw], ['RAW THRESHOLD', trace.thresholdRaw]]) {
      const row = document.createElement('div'); row.append(text('dt', label), text('dd', value)); details.append(row);
    }
    card.append(head, expression, details);
    elements.traces.append(card);
  }
}

function renderActions(actions = []) {
  elements.actions.replaceChildren();
  if (!actions.length) {
    const empty = text('div', '', 'empty-state');
    empty.append(text('strong', 'NO ACTION RECORDS'), text('span', 'Persistent history will appear after a FIRE decision.'));
    elements.actions.append(empty); return;
  }
  for (const action of actions) {
    const card = text('article', '', 'action-card');
    card.append(text('b', action.type.toUpperCase()), text('span', `${action.actionId} · RUN ${action.runId}`), text('time', action.recordedAt));
    elements.actions.append(card);
  }
}

async function requestJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(70000) });
  const data = await response.json();
  if (!response.ok && !data.decision) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function loadActions() {
  try { renderActions((await requestJson('/api/actions?limit=25')).actions); } catch (error) { elements.actionStatus.textContent = `HISTORY ERROR · ${error.message}`; }
}

async function runGuardian() {
  elements.run.disabled = true; elements.error.hidden = true; setStatus('READING MCP', 'polling');
  elements.decision.textContent = '…'; elements.decision.dataset.decision = 'idle'; elements.actionStatus.textContent = 'NO TRANSACTION · LIVE READS';
  const runId = `web-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  elements.runId.textContent = runId;
  try {
    const result = await requestJson('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId, policy: currentPolicy() }) });
    elements.decision.textContent = result.decision;
    elements.decision.dataset.decision = result.decision.toLowerCase();
    elements.block.textContent = result.blockNumber || '—';
    renderTraces(result.traces);
    if (result.decision === 'ERROR') {
      setStatus('ERROR', 'error'); elements.error.hidden = false; elements.error.textContent = `ERROR / NO ACTION — ${result.error}`;
      elements.traceSummary.textContent = 'REQUIRED READ FAILED'; elements.actionStatus.textContent = 'NO ACTION RECORDED';
    } else {
      const passCount = result.traces.filter((trace) => trace.pass).length;
      setStatus('COMPLETE', 'live'); elements.traceSummary.textContent = `${passCount}/3 CONDITIONS PASS`;
      elements.actionStatus.textContent = result.action ? `${result.action.created ? 'RECORDED' : 'DEDUPLICATED'} · ${result.action.actionId}` : 'HOLD · NO ACTION RECORDED';
    }
    await loadActions();
  } catch (error) {
    setStatus('ERROR', 'error'); elements.decision.textContent = 'ERROR'; elements.decision.dataset.decision = 'error';
    elements.error.hidden = false; elements.error.textContent = `ERROR / NO ACTION — ${error.message}`; renderTraces([]); elements.actionStatus.textContent = 'NO ACTION RECORDED';
  } finally { elements.run.disabled = false; }
}

elements.firePreset.addEventListener('click', () => {
  elements.nativeOp.value = '>='; elements.nativeThreshold.value = '0';
  elements.tokenOp.value = '>='; elements.tokenThreshold.value = '0';
  elements.gasOp.value = '>='; elements.gasThreshold.value = '0';
});
elements.holdPreset.addEventListener('click', () => {
  elements.nativeOp.value = '>'; elements.nativeThreshold.value = '0';
  elements.tokenOp.value = '>='; elements.tokenThreshold.value = '0';
  elements.gasOp.value = '>='; elements.gasThreshold.value = '0';
});
elements.run.addEventListener('click', runGuardian);

(async () => {
  try {
    const config = await requestJson('/api/config'); applyPolicy(config.defaultPolicy); await loadActions();
  } catch (error) { setStatus('CONFIG ERROR', 'error'); elements.error.hidden = false; elements.error.textContent = error.message; }
})();
