// Copy Matrix Agent — deterministic client-side simulation

const PERSONAS = [
  { id: 'first', short: 'First-time<br/>refinancer' },
  { id: 'selfemp', short: 'Self-<br/>employed' },
  { id: 'equity', short: 'High-equity<br/>homeowner' },
  { id: 'cashout', short: 'Cash-out<br/>seeker' },
];

const PAINS = [
  { id: 'fees', short: 'Hidden fees' },
  { id: 'slow', short: 'Slow approval' },
  { id: 'rate', short: 'Bad rate' },
  { id: 'docs', short: 'Doc hassle' },
];

const CELLS = {
  'first-fees': { h: '"First refi? No surprise fees, ever."', b: 'Built for first-time refinancers. No origination fee. No prepayment penalty.', ctr: 1.8, perf: 'mid' },
  'first-slow': { h: '"Your first refi, done in 14 days."', b: 'Lock your rate today. Close on average in 14 business days.', ctr: 2.0, perf: 'mid' },
  'first-rate': { h: '"First-time? You qualify for our best rate."', b: 'Rate-match guarantee for first-time refinancers. See your number.', ctr: 1.1, perf: 'loser' },
  'first-docs': { h: '"Refi for first-timers — 5 documents."', b: 'Walked through every step. Less paperwork, more progress.', ctr: 0.9, perf: 'loser' },

  'selfemp-fees': { h: '"Self-employed rates without the fine print."', b: 'Transparent pricing for 1099 income. No bait-and-switch.', ctr: 2.7, perf: 'winner' },
  'selfemp-slow': { h: '"1099 income? Close in 14 days."', b: 'Self-employed underwriting, accelerated. Most close in 2 weeks.', ctr: 2.9, perf: 'winner' },
  'selfemp-rate': { h: '"Self-employed deserve a fair rate."', b: 'Stop paying the W-2 markup. See your real rate today.', ctr: 3.2, perf: 'winner' },
  'selfemp-docs': { h: '"Self-employed? Skip the W-2 pile."', b: 'Bank statement program. 12 months, no tax returns required.', ctr: 3.8, perf: 'top' },

  'equity-fees': { h: '"Equity-rich? Keep more of it."', b: 'Refi without giving up your gains. Low closing costs.', ctr: 1.7, perf: 'mid' },
  'equity-slow': { h: '"60% equity refi · close in 14 days."', b: 'High-equity loans fast-tracked. See your rate in 90 seconds.', ctr: 2.1, perf: 'mid' },
  'equity-rate': { h: '"Your equity earns you our top rate."', b: 'More equity, better pricing tier. Calculate yours.', ctr: 2.6, perf: 'winner' },
  'equity-docs': { h: '"High-equity refi · streamlined docs."', b: 'Equity verified instantly. Fewer documents required.', ctr: 1.6, perf: 'mid' },

  'cashout-fees': { h: '"Cash out without cashing in fees."', b: 'Take equity out. No hidden costs. Plain pricing.', ctr: 1.9, perf: 'mid' },
  'cashout-slow': { h: '"Cash in hand in 14 days."', b: 'Cash-out refi from application to funding in 2 weeks.', ctr: 2.3, perf: 'mid' },
  'cashout-rate': { h: '"Cash out at refi rates — not credit card rates."', b: 'Skip the 21% APR. Tap equity at mortgage pricing.', ctr: 2.8, perf: 'winner' },
  'cashout-docs': { h: '"Cash-out refi · less paperwork."', b: 'Streamlined cash-out program for qualified borrowers.', ctr: 1.0, perf: 'loser' },
};

const ROUND2 = [
  { h: '"Bank statements > tax returns."', m: 'Self-employed × Docs' },
  { h: '"No W-2 required. No problem."', m: 'Self-employed × Docs' },
  { h: '"24 months of statements. That\'s it."', m: 'Self-employed × Docs' },
  { h: '"Self-employed? Rate-shopped 5 lenders. We win."', m: 'Self-employed × Rate' },
  { h: '"Your tax write-offs shouldn\'t cost you a refi."', m: 'Self-employed × Rate' },
  { h: '"1099? Your rate, not the bank\'s assumption."', m: 'Self-employed × Rate' },
  { h: '"Freelancer? Founder? Same rate as W-2."', m: 'Self-employed × Rate' },
  { h: '"Skip the W-2 markup. Save $340/mo."', m: 'Self-employed × Rate' },
];

let state;
let speed = 1;
let script = [];
let scriptIdx = 0;

const STATUS_GLOW = {
  learn: 'rgba(201, 138, 138, 0.15)',
  generate: 'rgba(201, 138, 138, 0.15)',
  deploy: 'rgba(201, 138, 138, 0.15)',
  done: 'rgba(107, 158, 120, 0.15)',
  good: 'rgba(107, 158, 120, 0.15)',
};

function initState() {
  state = {
    playing: false,
    simTime: new Date(2026, 4, 29, 10, 14, 3),
    logs: [],
    variantCount: 0,
    deployedCount: 0,
  };
}

function renderEmptyMatrix() {
  const grid = document.getElementById('matrix');
  let html = '<div class="mh-corner">Persona ↓<br/>Pain →</div>';
  PAINS.forEach((p) => {
    html += `<div class="mh-col" id="mh-col-${p.id}">${p.short}</div>`;
  });
  PERSONAS.forEach((persona) => {
    html += `<div class="mh-row" id="mh-row-${persona.id}">${persona.short}</div>`;
    PAINS.forEach((pain) => {
      const key = `${persona.id}-${pain.id}`;
      const cell = CELLS[key];
      html += `<div class="cell" id="cell-${key}">
        <div class="cell-headline">${cell.h}</div>
        <div class="cell-body">${cell.b}</div>
        <div class="cell-perf">
          <span class="ctr-val"></span>
          <span class="badge-val"></span>
        </div>
      </div>`;
    });
  });
  grid.innerHTML = html;
}

function startGenerateCell(key) {
  document.getElementById(`cell-${key}`).classList.add('generating');
}

function finishGenerateCell(key) {
  const cell = document.getElementById(`cell-${key}`);
  cell.classList.remove('generating');
  cell.classList.add('shown');
  state.variantCount++;
  document.getElementById('matrixCount').textContent =
    `${state.variantCount} variants · ${state.deployedCount} deployed`;
}

function deployAll() {
  state.deployedCount = state.variantCount;
  document.getElementById('matrixCount').textContent =
    `${state.variantCount} variants · ${state.deployedCount} deployed`;
  document.getElementById('matrixPill').textContent = 'deployed · scoring';
}

function scoreCell(key) {
  const cell = document.getElementById(`cell-${key}`);
  cell.classList.add('scored');
  const data = CELLS[key];
  const ctrEl = cell.querySelector('.ctr-val');
  const badgeEl = cell.querySelector('.badge-val');
  ctrEl.textContent = `CTR ${data.ctr.toFixed(1)}%`;
  if (data.perf === 'top') {
    cell.classList.add('top', 'winner');
    badgeEl.textContent = '★ TOP';
  } else if (data.perf === 'winner') {
    cell.classList.add('winner');
    badgeEl.textContent = '▲';
  } else if (data.perf === 'loser') {
    cell.classList.add('loser');
    badgeEl.textContent = '▼';
  } else {
    badgeEl.textContent = '·';
  }
}

function highlightPattern() {
  document.getElementById('mh-row-selfemp').classList.add('highlight');
  document.getElementById('mh-col-docs').classList.add('highlight');
  PAINS.forEach((p) => {
    const cell = document.getElementById(`cell-selfemp-${p.id}`);
    cell.classList.add('row-highlight');
    setTimeout(() => cell.classList.remove('row-highlight'), 2200);
  });
  document.getElementById('patternCallout').classList.add('show');
}

function renderRound2() {
  document.getElementById('round2').innerHTML = ROUND2.map(
    (v, i) => `
    <div class="r2-cell" id="r2-${i}">
      <div class="r2-headline">${v.h}</div>
      <div class="r2-meta">${v.m}</div>
    </div>
  `,
  ).join('');
}

function showR2Cell(idx) {
  document.getElementById(`r2-${idx}`).classList.add('show');
  state.variantCount++;
  state.deployedCount++;
  document.getElementById('matrixCount').textContent =
    `${state.variantCount} variants · ${state.deployedCount} deployed`;
}

function showWinner(idx) {
  document.getElementById(`w${idx}`).classList.add('show');
}

function setStatus(text, mode) {
  document.getElementById('statusText').textContent = text;
  const dot = document.getElementById('statusPill').querySelector('.status-dot');
  const colors = {
    learn: 'var(--sim-accent)',
    generate: 'var(--sim-accent)',
    deploy: 'var(--sim-accent)',
    done: 'var(--sim-green)',
    good: 'var(--sim-green)',
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

function formatSimTime(d) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })} PT`;
}

function updateClock() {
  document.getElementById('simClockTime').textContent = formatSimTime(state.simTime);
}

function getScript() {
  const personaIds = PERSONAS.map((p) => p.id);
  const painIds = PAINS.map((p) => p.id);

  const cellGenerateBeats = [];
  personaIds.forEach((pid, rIdx) => {
    const keys = painIds.map((pn) => `${pid}-${pn}`);
    cellGenerateBeats.push({
      delay: 400,
      action: 'log',
      type: 'generate',
      msg: `Generating row ${rIdx + 1}/4 · persona "${pid}" × 4 pain points`,
    });
    keys.forEach((k, i) => {
      cellGenerateBeats.push({ delay: i === 0 ? 200 : 80, action: 'genStart', key: k });
    });
    cellGenerateBeats.push({ delay: 900, action: 'genFinishRow', keys });
  });

  const cellScoreBeats = [];
  personaIds.forEach((pid) => {
    painIds.forEach((pn, i) => {
      cellScoreBeats.push({ delay: i === 0 ? 250 : 90, action: 'score', key: `${pid}-${pn}` });
    });
  });

  return [
    { delay: 0, action: 'status', text: 'Learning', mode: 'learn' },
    { delay: 100, action: 'log', type: 'learn', msg: 'Pulling 90d creative performance · 142 prior variants' },
    { delay: 1200, action: 'log', type: 'learn', msg: 'Top 3 angles surfaced — Speed, Simplicity, Rate certainty' },
    { delay: 400, action: 'showWinner', idx: 1 },
    { delay: 250, action: 'showWinner', idx: 2 },
    { delay: 250, action: 'showWinner', idx: 3 },
    { delay: 800, action: 'log', type: 'learn', msg: 'Cluster analysis on converter cohort · 4 personas, 4 pain themes extracted' },
    { delay: 600, action: 'showAxes' },
    { delay: 100, action: 'setPill', el: 'learnPill', text: 'extracted' },

    { delay: 800, action: 'status', text: 'Generating', mode: 'generate' },
    { delay: 100, action: 'log', type: 'generate', msg: 'Generating 16-cell matrix · headline + primary text per cell' },
    { delay: 100, action: 'setPill', el: 'matrixPill', text: 'generating' },

    ...cellGenerateBeats,

    { delay: 600, action: 'log', type: 'generate', msg: 'QA pass · brand voice ✓ · disclaimers ✓ · length limits ✓' },
    { delay: 600, action: 'log', type: 'generate', msg: 'Compliance review · no prohibited claims · 16/16 approved' },

    { delay: 800, action: 'status', text: 'Deploying', mode: 'deploy' },
    { delay: 100, action: 'log', type: 'deploy', msg: '↗ Launching to Meta + Google as experiment EX-2381 · equal-weight 48h learning budget' },
    { delay: 800, action: 'deploy' },
    { delay: 100, action: 'log', type: 'success', msg: '✓ 48 ad units live (16 cells × 3 formats: search hl, primary, descr)' },

    { delay: 1000, action: 'timeskip', hours: 48 },
    { delay: 100, action: 'log', type: 'observe', msg: 'Time +48h · evaluating early signals (significance threshold reached for 14/16 cells)' },

    ...cellScoreBeats,

    { delay: 500, action: 'setPill', el: 'matrixPill', text: 'scored' },

    { delay: 700, action: 'log', type: 'pattern', msg: '⚡ Pattern detected — Self-employed row dominates · Docs pain point is the wedge' },
    { delay: 200, action: 'highlightPattern' },
    { delay: 1400, action: 'log', type: 'pattern', msg: 'Top cell: Self-employed × Docs · CTR 3.8% (138% above portfolio)' },
    { delay: 800, action: 'log', type: 'pattern', msg: 'Losers identified: 3 cells below significance floor · pausing' },

    { delay: 800, action: 'log', type: 'generate', msg: 'Generating Round 2 · 8 variants exploring around winning cells' },
    { delay: 400, action: 'reveal', section: 'round2Section' },

    { delay: 600, action: 'showR2', idx: 0 },
    { delay: 200, action: 'showR2', idx: 1 },
    { delay: 200, action: 'showR2', idx: 2 },
    { delay: 200, action: 'showR2', idx: 3 },
    { delay: 200, action: 'showR2', idx: 4 },
    { delay: 200, action: 'showR2', idx: 5 },
    { delay: 200, action: 'showR2', idx: 6 },
    { delay: 200, action: 'showR2', idx: 7 },

    { delay: 500, action: 'log', type: 'deploy', msg: '↗ Round 2 deployed · equal-weight 24h test' },
    { delay: 600, action: 'log', type: 'success', msg: '✓ Cycle complete · top performer promoted to evergreen · Round 3 queued for tomorrow' },

    { delay: 800, action: 'reveal', section: 'resultsSection' },
    { delay: 100, action: 'status', text: 'Cycle complete', mode: 'done' },
  ];
}

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
  if (beat.delay > 300) {
    state.simTime = new Date(state.simTime.getTime() + Math.round(beat.delay / 1000) * 30 * 1000);
    updateClock();
  }
  switch (beat.action) {
    case 'log':
      addLog(beat.type, beat.msg);
      break;
    case 'status':
      setStatus(beat.text, beat.mode);
      break;
    case 'showWinner':
      showWinner(beat.idx);
      break;
    case 'showAxes':
      document.getElementById('axesExtract').classList.add('show');
      break;
    case 'setPill':
      document.getElementById(beat.el).textContent = beat.text;
      break;
    case 'genStart':
      startGenerateCell(beat.key);
      break;
    case 'genFinishRow':
      beat.keys.forEach((k) => finishGenerateCell(k));
      break;
    case 'deploy':
      deployAll();
      break;
    case 'score':
      scoreCell(beat.key);
      break;
    case 'highlightPattern':
      highlightPattern();
      break;
    case 'reveal':
      document.getElementById(beat.section).classList.add('show');
      break;
    case 'showR2':
      showR2Cell(beat.idx);
      break;
    case 'timeskip':
      state.simTime = new Date(state.simTime.getTime() + beat.hours * 3600 * 1000);
      updateClock();
      break;
    default:
      break;
  }
}

function setPlayButton(playing) {
  document.getElementById('playBtn').innerHTML = playing
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
  document.getElementById('matrixCount').textContent = '0 variants · 0 deployed';
  document.querySelectorAll('.reveal').forEach((el) => el.classList.remove('show'));
  document.querySelectorAll('.winner').forEach((el) => el.classList.remove('show'));
  document.getElementById('axesExtract').classList.remove('show');
  document.getElementById('patternCallout').classList.remove('show');
  document.getElementById('learnPill').textContent = 'analyzing…';
  document.getElementById('matrixPill').textContent = 'pending';
  ['mh-row-selfemp', 'mh-col-docs'].forEach((id) =>
    document.getElementById(id)?.classList.remove('highlight'),
  );
  renderEmptyMatrix();
  renderRound2();
  updateClock();
  setStatus('Ready', 'good');
}

function initCopyMatrix() {
  document.getElementById('playBtn').addEventListener('click', () => (state.playing ? pause() : play()));
  document.getElementById('resetBtn').addEventListener('click', reset);
  document.querySelectorAll('#speedToggle button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#speedToggle button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      speed = parseInt(b.dataset.speed, 10);
    });
  });
  document.getElementById('hintReset')?.addEventListener('click', (e) => {
    e.preventDefault();
    reset();
  });

  initState();
  script = getScript();
  renderEmptyMatrix();
  renderRound2();
  updateClock();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCopyMatrix);
} else {
  initCopyMatrix();
}
