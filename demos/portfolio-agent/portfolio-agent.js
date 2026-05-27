// Portfolio Optimization Agent — deterministic client-side simulation

const PLATFORMS = [
  { id: 'google', name: 'Google', icon: 'G', spend: 8100, budget: 15000, cpa: 51, targetCpa: 64, roas: 4.1, status: 'good' },
  { id: 'meta', name: 'Meta', icon: 'M', spend: 14200, budget: 20000, cpa: 44, targetCpa: 44, roas: 3.2, status: 'good' },
  { id: 'tiktok', name: 'TikTok', icon: 'T', spend: 4300, budget: 8000, cpa: 38, targetCpa: 40, roas: 2.8, status: 'good' },
  { id: 'prog', name: 'Programmatic', icon: 'P', spend: 6800, budget: 12000, cpa: 72, targetCpa: 75, roas: 2.1, status: 'good' },
];

let state;
let speed = 1;
let guardrails = {
  maxReallocPct: 15,
  approvalThreshold: 5000,
  metaFloor: 8000,
};

function initState() {
  state = {
    step: 0,
    playing: false,
    simTime: new Date(2026, 4, 26, 14, 14, 8),
    platforms: JSON.parse(JSON.stringify(PLATFORMS)),
    logs: [],
    actionVisible: false,
    actionExecuted: false,
    proposedAmount: 4200,
  };
}

function getScript() {
  const shiftAmount = Math.min(
    Math.round(state.platforms[1].spend * guardrails.maxReallocPct / 100),
    Math.max(0, state.platforms[1].spend - guardrails.metaFloor),
    4200,
  );
  state.proposedAmount = shiftAmount;
  const needsApproval = shiftAmount > guardrails.approvalThreshold;

  return [
    { delay: 0, action: 'log', type: 'observe', msg: 'Heartbeat: all 4 channels nominal. Portfolio ROAS 3.1×, blended CPA $51.' },
    { delay: 2200, action: 'log', type: 'observe', msg: 'Polling Meta Ads API — 30s window' },
    { delay: 1800, action: 'metric', target: 'meta', changes: { cpa: 52 } },
    { delay: 100, action: 'log', type: 'observe', msg: 'Meta CPA drifting: $44 → $52' },
    { delay: 1600, action: 'metric', target: 'meta', changes: { cpa: 58, status: 'alert' } },
    { delay: 100, action: 'status', text: 'Anomaly detected', mode: 'alert' },
    { delay: 100, action: 'log', type: 'alert', msg: '⚠ Anomaly: Meta CPA up 34% vs 7-day baseline (z-score 2.8)' },
    { delay: 1400, action: 'status', text: 'Analyzing', mode: 'think' },
    { delay: 100, action: 'log', type: 'think', msg: 'Investigating Meta anomaly — checking frequency, audience saturation, creative fatigue' },
    { delay: 1200, action: 'log', type: 'think', msg: 'Found: top 3 Meta ad sets at frequency 7.2 (threshold 5.0). Creative fatigue likely.' },
    { delay: 1200, action: 'log', type: 'think', msg: 'Scanning peer channels for absorption capacity…' },
    { delay: 1400, action: 'log', type: 'think', msg: 'Google Search [Refi-Intent] converting at $51 CPA vs $64 target (20% below). Budget 54% utilized — $6.9K headroom.' },
    { delay: 1200, action: 'log', type: 'think', msg: `Optimization candidate: shift $${shiftAmount.toLocaleString()} from Meta [Awareness-NE] → Google Search [Refi-Intent]` },
    { delay: 1000, action: 'status', text: 'Decision ready', mode: 'decide' },
    { delay: 100, action: 'showAction', amount: shiftAmount, needsApproval },
    { delay: 100, action: 'log', type: 'decide', msg: `Proposed reallocation: $${shiftAmount.toLocaleString()} Meta → Google. Projected lift: +$${(shiftAmount * 2).toLocaleString()} 24h attributable value.` },
    { delay: 1200, action: 'guardCheck', idx: 0 },
    { delay: 400, action: 'guardCheck', idx: 1 },
    { delay: 400, action: 'guardCheck', idx: 2 },
    { delay: 400, action: 'guardCheck', idx: 3 },
    { delay: 400, action: 'guardCheck', idx: 4 },
    ...(needsApproval
      ? [
          { delay: 800, action: 'log', type: 'decide', msg: `Action exceeds $${guardrails.approvalThreshold.toLocaleString()} approval threshold — awaiting human confirmation.` },
          { delay: 100, action: 'status', text: 'Awaiting approval', mode: 'amber' },
        ]
      : [
          { delay: 1000, action: 'status', text: 'Executing', mode: 'execute' },
          { delay: 100, action: 'log', type: 'execute', msg: '✓ Action auto-approved (within guardrails). Executing reallocation…' },
          { delay: 1400, action: 'execute' },
          { delay: 100, action: 'log', type: 'execute', msg: `✓ Meta daily cap reduced by $${shiftAmount.toLocaleString()}. Google Search cap raised by $${shiftAmount.toLocaleString()}.` },
          { delay: 800, action: 'log', type: 'execute', msg: 'Audit log entry #4729 written. Notified marketing-ops Slack channel.' },
          { delay: 1200, action: 'timeskip', minutes: 180 },
          { delay: 100, action: 'log', type: 'observe', msg: 'Time +3h — monitoring outcomes' },
          { delay: 1000, action: 'metric', target: 'meta', changes: { cpa: 51, status: 'improving' } },
          { delay: 100, action: 'log', type: 'outcome', msg: 'Meta CPA recovered to $51 (creative refresh + spend throttle).' },
          { delay: 1000, action: 'metric', target: 'google', changes: { spend: 11400, cpa: 49, roas: 4.4, status: 'improving' } },
          { delay: 100, action: 'log', type: 'outcome', msg: 'Google Search absorbed shifted spend — CPA $49, ROAS 4.4×.' },
          { delay: 1000, action: 'log', type: 'outcome', msg: '✓ Net daily impact: +$12.4K attributable value at constant total spend.' },
          { delay: 100, action: 'status', text: 'Optimization complete', mode: 'done' },
        ]),
  ];
}

function renderPlatforms() {
  const el = document.getElementById('platforms');
  el.innerHTML = state.platforms
    .map((p) => {
      const pct = Math.round((p.spend / p.budget) * 100);
      const cpaClass = p.cpa > p.targetCpa ? 'bad' : p.cpa < p.targetCpa * 0.85 ? 'good' : '';
      const badgeClass = p.status === 'alert' ? 'alert' : p.status === 'improving' ? '' : '';
      const badgeText = p.status === 'alert' ? 'ANOMALY' : p.status === 'improving' ? 'OPTIMIZING' : 'NORMAL';
      const cardClass = p.status === 'alert' ? 'alert' : p.status === 'improving' ? 'improving' : '';
      const barColor = p.status === 'alert' ? 'var(--sim-red)' : 'var(--sim-accent)';
      return `
      <div class="pcard ${cardClass}" id="pcard-${p.id}">
        <div class="pcard-head">
          <div class="pcard-name">${p.name}</div>
          <div class="pcard-badge ${badgeClass}">${badgeText}</div>
        </div>
        <div class="pcard-spend">$${(p.spend / 1000).toFixed(1)}K</div>
        <div class="pcard-budget">of $${(p.budget / 1000).toFixed(0)}K daily</div>
        <div class="budget-bar"><div class="budget-bar-fill" style="width: ${pct}%; background: ${barColor}"></div></div>
        <div class="pcard-metrics">
          <div class="pmetric">
            <div class="label">CPA</div>
            <div class="value ${cpaClass}">$${p.cpa}</div>
          </div>
          <div class="pmetric">
            <div class="label">ROAS</div>
            <div class="value">${p.roas.toFixed(1)}×</div>
          </div>
        </div>
      </div>`;
    })
    .join('');
  updateSummary();
}

function updateSummary() {
  const totalSpend = state.platforms.reduce((s, p) => s + p.spend, 0);
  const totalBudget = state.platforms.reduce((s, p) => s + p.budget, 0);
  const blendedCpa = Math.round(state.platforms.reduce((s, p) => s + p.cpa * p.spend, 0) / totalSpend);
  const blendedRoas = (state.platforms.reduce((s, p) => s + p.roas * p.spend, 0) / totalSpend).toFixed(1);
  document.getElementById('totalSpend').textContent = `$${(totalSpend / 1000).toFixed(1)}K`;
  document.getElementById('spendDelta').textContent = `/ $${(totalBudget / 1000).toFixed(0)}K`;
  document.getElementById('totalRoas').textContent = `${blendedRoas}×`;
  document.getElementById('totalCpa').textContent = `$${blendedCpa}`;
}

const STATUS_GLOW = {
  alert: 'rgba(184, 92, 92, 0.15)',
  think: 'rgba(196, 165, 116, 0.15)',
  decide: 'rgba(196, 165, 116, 0.15)',
  execute: 'rgba(107, 158, 120, 0.15)',
  amber: 'rgba(196, 181, 160, 0.15)',
  done: 'rgba(107, 158, 120, 0.15)',
  good: 'rgba(107, 158, 120, 0.15)',
};

function setStatus(text, mode) {
  document.getElementById('statusText').textContent = text;
  const pill = document.getElementById('statusPill');
  const dot = pill.querySelector('.status-dot');
  const colors = {
    alert: 'var(--sim-red)',
    think: 'var(--sim-accent)',
    decide: 'var(--sim-accent)',
    execute: 'var(--sim-green)',
    amber: 'var(--sim-amber)',
    done: 'var(--sim-green)',
  };
  dot.style.background = colors[mode] || 'var(--sim-green)';
  dot.style.boxShadow = `0 0 0 4px ${STATUS_GLOW[mode] || STATUS_GLOW.good}`;
}

function addLog(type, msg) {
  const time = state.simTime.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  state.logs.push({ ts: time, type, msg });
  const body = document.getElementById('logBody');
  document.getElementById('logEmpty')?.remove();
  const el = document.createElement('div');
  el.className = `log-entry ${type}`;
  el.innerHTML = `<span class="ts">${time}</span><span class="msg">${msg}</span>`;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
  document.getElementById('logCount').textContent = `${state.logs.length} events`;
}

function updatePlatform(id, changes) {
  const p = state.platforms.find((x) => x.id === id);
  Object.assign(p, changes);
  renderPlatforms();
}

function showAction(amount, needsApproval) {
  const card = document.getElementById('actionCard');
  document.getElementById('actionStatement').innerHTML =
    `Shift <span class="amount">$${amount.toLocaleString()}</span> from <span class="from">Meta · Awareness-NE</span> to <span class="to">Google · Refi-Intent</span>`;
  document.getElementById('actionProjection').innerHTML =
    `Projected 24h impact: <b>+$${(amount * 2).toLocaleString()} attributable value</b> at constant total spend`;
  document.getElementById('confidence').textContent = '87%';

  const checks = [
    {
      label: 'Max daily reallocation',
      value: `Shifting ${((amount / state.platforms[1].spend) * 100).toFixed(1)}% (limit ${guardrails.maxReallocPct}%)`,
    },
    {
      label: 'Meta floor preserved',
      value: `$${((state.platforms[1].spend - amount) / 1000).toFixed(1)}K ≥ $${(guardrails.metaFloor / 1000).toFixed(0)}K min`,
    },
    { label: 'Campaigns in auto-action set', value: 'Both approved' },
    { label: 'Outside earnings blackout', value: 'OK · next: Jul 17' },
    {
      label: needsApproval ? 'Human approval' : 'Below approval threshold',
      value: needsApproval
        ? `Required > $${guardrails.approvalThreshold.toLocaleString()}`
        : `$${amount.toLocaleString()} < $${guardrails.approvalThreshold.toLocaleString()}`,
    },
  ];
  document.getElementById('guardrails').innerHTML = checks
    .map(
      (c, i) => `
    <div class="guard" id="guard-${i}">
      <div class="guard-icon">✓</div>
      <div class="guard-text"><b>${c.label}</b></div>
      <div class="guard-value">${c.value}</div>
    </div>`,
    )
    .join('');
  card.classList.add('visible');
  state.actionVisible = true;
}

function checkGuard(idx) {
  document.getElementById(`guard-${idx}`)?.classList.add('checked');
}

function executeAction() {
  if (state.actionExecuted) return;
  state.actionExecuted = true;
  const amount = state.proposedAmount;
  updatePlatform('meta', {
    spend: state.platforms[1].spend - amount,
    budget: state.platforms[1].budget - amount,
    status: 'alert',
  });
  updatePlatform('google', {
    spend: state.platforms[0].spend,
    budget: state.platforms[0].budget + amount,
    status: 'improving',
  });
}

function advanceTime(minutes) {
  state.simTime = new Date(state.simTime.getTime() + minutes * 60000);
  document.getElementById('simClock').textContent = formatSimTime(state.simTime);
}

function formatSimTime(d) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })} PT`;
}

let script = [];
let scriptIdx = 0;

function step() {
  if (!state.playing) return;
  if (scriptIdx >= script.length) {
    state.playing = false;
    setPlayButton(false);
    return;
  }
  const beat = script[scriptIdx++];
  setTimeout(() => {
    runBeat(beat);
    step();
  }, beat.delay / speed);
}

function runBeat(beat) {
  if (beat.delay > 200) advanceTime(Math.round((beat.delay / 1000) * 5));
  document.getElementById('simClock').textContent = formatSimTime(state.simTime);

  switch (beat.action) {
    case 'log':
      addLog(beat.type, beat.msg);
      break;
    case 'metric':
      updatePlatform(beat.target, beat.changes);
      break;
    case 'status':
      setStatus(beat.text, beat.mode);
      break;
    case 'showAction':
      showAction(beat.amount, beat.needsApproval);
      break;
    case 'guardCheck':
      checkGuard(beat.idx);
      break;
    case 'execute':
      executeAction();
      break;
    case 'timeskip':
      advanceTime(beat.minutes);
      break;
    default:
      break;
  }
}

function setPlayButton(playing) {
  const btn = document.getElementById('playBtn');
  btn.innerHTML = playing
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
}

function play() {
  if (scriptIdx >= script.length) reset();
  state.playing = true;
  setPlayButton(true);
  step();
}

function pause() {
  state.playing = false;
  setPlayButton(false);
}

function reset() {
  pause();
  initState();
  script = getScript();
  scriptIdx = 0;
  document.getElementById('logBody').innerHTML =
    '<div class="log-empty" id="logEmpty">Press play to start simulation</div>';
  document.getElementById('logCount').textContent = '0 events';
  document.getElementById('actionCard').classList.remove('visible');
  document.getElementById('simClock').textContent = formatSimTime(state.simTime);
  setStatus('Monitoring', 'good');
  renderPlatforms();
}

function initPortfolioAgent() {
  document.getElementById('playBtn').addEventListener('click', () => (state.playing ? pause() : play()));
  document.getElementById('resetBtn').addEventListener('click', reset);
  document.getElementById('executeBtn').addEventListener('click', () => {
    if (!state.actionExecuted) {
      executeAction();
      addLog('execute', '✓ Action executed by user. Audit logged.');
      setStatus('Executed', 'execute');
    }
  });
  document.getElementById('overrideBtn').addEventListener('click', () => {
    pause();
    addLog('alert', '✗ Action overridden by user. Holding allocation.');
    setStatus('Held', 'amber');
  });

  document.querySelectorAll('#speedToggle button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#speedToggle button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      speed = parseInt(b.dataset.speed, 10);
    });
  });

  const modal = document.getElementById('modalBackdrop');
  document.getElementById('guardrailsBtn').addEventListener('click', () => modal.classList.add('open'));
  document.getElementById('modalCancel').addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  const sliders = [
    { slider: 'maxReallocSlider', value: 'maxReallocValue', key: 'maxReallocPct', fmt: (v) => v },
    {
      slider: 'approvalSlider',
      value: 'approvalValue',
      key: 'approvalThreshold',
      fmt: (v) => Number(v).toLocaleString(),
    },
    { slider: 'floorSlider', value: 'floorValue', key: 'metaFloor', fmt: (v) => Number(v).toLocaleString() },
  ];
  sliders.forEach((s) => {
    document.getElementById(s.slider).addEventListener('input', (e) => {
      document.getElementById(s.value).textContent = s.fmt(e.target.value);
    });
  });
  document.getElementById('modalApply').addEventListener('click', () => {
    sliders.forEach((s) => {
      guardrails[s.key] = parseInt(document.getElementById(s.slider).value, 10);
    });
    modal.classList.remove('open');
    reset();
  });

  document.getElementById('hintReset')?.addEventListener('click', (e) => {
    e.preventDefault();
    reset();
  });
  document.getElementById('hintGuardrails')?.addEventListener('click', (e) => {
    e.preventDefault();
    modal.classList.add('open');
  });

  initState();
  script = getScript();
  renderPlatforms();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPortfolioAgent);
} else {
  initPortfolioAgent();
}
