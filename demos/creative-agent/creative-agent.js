// Creative Performance Agent — deterministic client-side simulation

function adStandard(opts) {
  const { id, bg1, bg2, accent = '#1e3a8a', headline, sub, cta = 'Apply now' } = opts;
  return `<svg viewBox="0 0 200 160" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient></defs>
    <rect width="200" height="160" fill="url(#g${id})"/>
    <circle cx="170" cy="-20" r="60" fill="white" opacity="0.08"/>
    <text x="12" y="18" font-size="7" fill="white" opacity="0.7" font-family="Inter, sans-serif" font-weight="700" letter-spacing="1">REFI-SMART</text>
    <text x="100" y="72" text-anchor="middle" font-size="15" fill="white" font-family="Inter, sans-serif" font-weight="700">${headline}</text>
    <text x="100" y="90" text-anchor="middle" font-size="9" fill="white" opacity="0.85" font-family="Inter, sans-serif">${sub}</text>
    <rect x="60" y="115" width="80" height="22" rx="11" fill="white"/>
    <text x="100" y="130" text-anchor="middle" font-size="9" fill="${accent}" font-family="Inter, sans-serif" font-weight="700">${cta}</text>
  </svg>`;
}

function adBigNum(opts) {
  const { id, bg1, bg2, num = '5.8%', sub, cta = 'Get my rate' } = opts;
  return `<svg viewBox="0 0 200 160" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient></defs>
    <rect width="200" height="160" fill="url(#g${id})"/>
    <text x="12" y="18" font-size="7" fill="white" opacity="0.7" font-family="Inter, sans-serif" font-weight="700" letter-spacing="1">REFI-SMART</text>
    <text x="100" y="78" text-anchor="middle" font-size="44" fill="white" font-family="Inter, sans-serif" font-weight="800" letter-spacing="-2">${num}</text>
    <text x="100" y="98" text-anchor="middle" font-size="9" fill="white" opacity="0.9" font-family="Inter, sans-serif" font-weight="500">${sub}</text>
    <rect x="55" y="118" width="90" height="22" rx="11" fill="white"/>
    <text x="100" y="133" text-anchor="middle" font-size="9" fill="#1e3a8a" font-family="Inter, sans-serif" font-weight="700">${cta}</text>
  </svg>`;
}

function adMinimal(opts) {
  const { id, bg1, bg2, headline, sub, cta = 'Start now' } = opts;
  return `<svg viewBox="0 0 200 160" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient></defs>
    <rect width="200" height="160" fill="url(#g${id})"/>
    <line x1="20" y1="40" x2="40" y2="40" stroke="white" stroke-width="2" opacity="0.5"/>
    <text x="20" y="60" font-size="13" fill="white" font-family="Inter, sans-serif" font-weight="700">${headline}</text>
    <text x="20" y="78" font-size="9" fill="white" opacity="0.7" font-family="Inter, sans-serif">${sub}</text>
    <text x="20" y="135" font-size="10" fill="white" font-family="Inter, sans-serif" font-weight="600" text-decoration="underline">${cta} →</text>
  </svg>`;
}

function adLifestyle(opts) {
  const { id, bg1, bg2, headline, sub } = opts;
  return `<svg viewBox="0 0 200 160" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient></defs>
    <rect width="200" height="160" fill="url(#g${id})"/>
    <polygon points="100,50 140,80 140,120 60,120 60,80" fill="white" opacity="0.18"/>
    <polygon points="100,50 140,80 60,80" fill="white" opacity="0.25"/>
    <rect x="92" y="100" width="16" height="20" fill="white" opacity="0.4"/>
    <text x="12" y="18" font-size="7" fill="white" opacity="0.7" font-family="Inter, sans-serif" font-weight="700" letter-spacing="1">REFI-SMART</text>
    <text x="100" y="142" text-anchor="middle" font-size="11" fill="white" font-family="Inter, sans-serif" font-weight="700">${headline}</text>
    <text x="100" y="154" text-anchor="middle" font-size="8" fill="white" opacity="0.75" font-family="Inter, sans-serif">${sub}</text>
  </svg>`;
}

function adData(opts) {
  const { id, bg1, bg2, stat = '$340', label = '/mo back', sub, cta = 'See your number' } = opts;
  return `<svg viewBox="0 0 200 160" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient></defs>
    <rect width="200" height="160" fill="url(#g${id})"/>
    <polyline points="20,110 50,95 80,100 110,75 140,80 170,55" stroke="white" stroke-width="1.5" fill="none" opacity="0.4"/>
    <circle cx="170" cy="55" r="3" fill="white"/>
    <text x="12" y="18" font-size="7" fill="white" opacity="0.7" font-family="Inter, sans-serif" font-weight="700" letter-spacing="1">REFI-SMART</text>
    <text x="20" y="65" font-size="28" fill="white" font-family="Inter, sans-serif" font-weight="800" letter-spacing="-1">${stat}</text>
    <text x="20" y="80" font-size="10" fill="white" opacity="0.8" font-family="Inter, sans-serif" font-weight="500">${label}</text>
    <text x="20" y="135" font-size="9" fill="white" opacity="0.9" font-family="Inter, sans-serif">${sub}</text>
    <text x="20" y="150" font-size="9" fill="white" font-family="Inter, sans-serif" font-weight="700" text-decoration="underline">${cta} →</text>
  </svg>`;
}

function adBoldType(opts) {
  const { id, bg1, bg2, line1 = 'Less monthly.', line2 = 'More monthly.', cta = 'Refinance now' } = opts;
  return `<svg viewBox="0 0 200 160" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient></defs>
    <rect width="200" height="160" fill="url(#g${id})"/>
    <text x="100" y="60" text-anchor="middle" font-size="16" fill="white" font-family="Inter, sans-serif" font-weight="800" letter-spacing="-0.5">${line1}</text>
    <text x="100" y="82" text-anchor="middle" font-size="16" fill="white" font-family="Inter, sans-serif" font-weight="800" letter-spacing="-0.5">${line2}</text>
    <line x1="40" y1="100" x2="160" y2="100" stroke="white" stroke-width="1" opacity="0.3"/>
    <text x="100" y="125" text-anchor="middle" font-size="9" fill="white" opacity="0.9" font-family="Inter, sans-serif" font-weight="600">${cta} →</text>
  </svg>`;
}

const INITIAL_CREATIVES = [
  { id: 'REF-014', name: 'Lower your rate today', svg: () => adStandard({ id: 'c1', bg1: '#1e40af', bg2: '#3b82f6', headline: 'Lower your rate today', sub: 'Refinance in as few as 14 days' }), ctr: 2.1, freq: 7.4, cvr: 3.8, days: 14, status: 'fatigued' },
  { id: 'REF-022', name: 'Refi in 14 days', svg: () => adStandard({ id: 'c2', bg1: '#0f766e', bg2: '#14b8a6', headline: 'Refi in 14 days', sub: 'No origination fees', cta: 'Get my rate', accent: '#0f766e' }), ctr: 1.9, freq: 4.2, cvr: 3.1, days: 9, status: 'good' },
  { id: 'REF-027', name: 'Smart refinancing', svg: () => adStandard({ id: 'c3', bg1: '#1e293b', bg2: '#475569', headline: 'Smart refinancing', sub: 'Built for your numbers', cta: 'Start' }), ctr: 1.7, freq: 5.1, cvr: 2.9, days: 11, status: 'warning' },
  { id: 'REF-031', name: 'Your savings await', svg: () => adStandard({ id: 'c4', bg1: '#7c2d12', bg2: '#ea580c', headline: 'Your savings await', sub: 'Refi-Smart by Northbridge', cta: 'See rates', accent: '#7c2d12' }), ctr: 1.8, freq: 3.8, cvr: 3.4, days: 6, status: 'good' },
  { id: 'REF-034', name: 'Apply in minutes', svg: () => adStandard({ id: 'c5', bg1: '#581c87', bg2: '#a855f7', headline: 'Apply in minutes', sub: 'Decision in 48 hours', cta: 'Apply now', accent: '#581c87' }), ctr: 2.0, freq: 3.5, cvr: 3.6, days: 5, status: 'good' },
  { id: 'REF-036', name: 'Cash out today', svg: () => adStandard({ id: 'c6', bg1: '#14532d', bg2: '#22c55e', headline: 'Cash out today', sub: 'Equity, on your terms', cta: 'Calculate', accent: '#14532d' }), ctr: 1.6, freq: 4.0, cvr: 2.8, days: 7, status: 'good' },
];

const GENERATED = [
  { template: adData, opts: { id: 'g1', bg1: '#1e40af', bg2: '#3b82f6', stat: '$340', label: '/mo back in your pocket', sub: 'Based on the median Refi-Smart customer', cta: 'See your number' } },
  { template: adBigNum, opts: { id: 'g2', bg1: '#0c4a6e', bg2: '#0ea5e9', num: '5.8%', sub: 'APR for qualified refinances', cta: 'Lock my rate' } },
  { template: adBoldType, opts: { id: 'g3', bg1: '#1e293b', bg2: '#334155', line1: 'Less monthly.', line2: 'More monthly.', cta: 'Refinance now' } },
  { template: adLifestyle, opts: { id: 'g4', bg1: '#1e3a8a', bg2: '#6366f1', headline: 'Home, secured.', sub: 'Refinance in 14 days' } },
  { template: adMinimal, opts: { id: 'g5', bg1: '#7c2d12', bg2: '#c2410c', headline: 'Your rate, rewritten.', sub: 'Refi-Smart · pre-qualify in 90 seconds', cta: 'Pre-qualify' } },
];

let state;
let speed = 1;
let script = [];
let scriptIdx = 0;

const STATUS_GLOW = {
  perf: 'rgba(196, 165, 116, 0.15)',
  gen: 'rgba(168, 148, 196, 0.15)',
  alert: 'rgba(184, 92, 92, 0.15)',
  execute: 'rgba(107, 158, 120, 0.15)',
  done: 'rgba(107, 158, 120, 0.15)',
  good: 'rgba(107, 158, 120, 0.15)',
};

function initState() {
  state = {
    playing: false,
    simTime: new Date(2026, 4, 27, 9, 42, 11),
    creatives: JSON.parse(JSON.stringify(INITIAL_CREATIVES)).map((c, i) => ({
      ...c,
      svg: INITIAL_CREATIVES[i].svg,
    })),
    logs: [],
    genProgress: 0,
  };
}

function renderCreatives() {
  const el = document.getElementById('creatives');
  el.innerHTML = state.creatives
    .map((c) => {
      const cls =
        c.status === 'fatigued'
          ? 'fatigued'
          : c.status === 'warning'
            ? 'warning'
            : c.status === 'paused'
              ? 'paused'
              : '';
      const badge =
        c.status === 'fatigued'
          ? 'FATIGUED'
          : c.status === 'warning'
            ? 'WATCH'
            : c.status === 'paused'
              ? 'PAUSED'
              : 'HEALTHY';
      const badgeCls = c.status === 'fatigued' ? 'fatigued' : c.status === 'warning' ? 'warning' : '';
      const ctrArrow = c.ctrDelta
        ? c.ctrDelta < 0
          ? '<span class="arrow-down">▼</span>'
          : '<span class="arrow-up">▲</span>'
        : '';
      const ctrCls = c.status === 'fatigued' ? 'bad' : '';
      const freqCls = c.freq > 5 ? 'bad' : '';
      return `<div class="creative ${cls}">
      ${c.svg ? c.svg() : ''}
      <div class="creative-info">
        <div class="creative-name">${c.id} <span class="badge ${badgeCls}">${badge}</span></div>
        <div class="creative-metrics">
          <div class="cm"><div class="label">CTR</div><div class="value ${ctrCls}">${c.ctr.toFixed(1)}% ${ctrArrow}</div></div>
          <div class="cm"><div class="label">Freq</div><div class="value ${freqCls}">${c.freq.toFixed(1)}</div></div>
          <div class="cm"><div class="label">CVR</div><div class="value">${c.cvr.toFixed(1)}%</div></div>
        </div>
      </div>
    </div>`;
    })
    .join('');
  const active = state.creatives.filter((c) => c.status !== 'paused' && !c.testing).length;
  const paused = state.creatives.filter((c) => c.status === 'paused').length;
  const testing = state.creatives.filter((c) => c.testing).length;
  document.getElementById('creativeCount').textContent = `${active} active · ${paused} paused · ${testing} testing`;
}

function initGenGrid() {
  document.getElementById('genGrid').innerHTML = GENERATED.map(
    (_, i) => `
    <div class="gen-slot" id="slot-${i}">
      <div class="gen-status">queued</div>
    </div>
  `,
  ).join('');
}

function startGenerating(idx) {
  const slot = document.getElementById(`slot-${idx}`);
  slot.classList.add('generating');
  slot.querySelector('.gen-status').textContent = 'rendering…';
}

function finishGenerating(idx) {
  const slot = document.getElementById(`slot-${idx}`);
  slot.classList.remove('generating');
  slot.classList.add('done');
  slot.querySelector('.gen-status')?.remove();
  slot.innerHTML = GENERATED[idx].template(GENERATED[idx].opts);
  state.genProgress = idx + 1;
  document.getElementById('genProgressCount').textContent = `${state.genProgress} / 5`;
  document.getElementById('genProgressLabel').textContent =
    state.genProgress === 5
      ? 'Generation complete · matching with top hooks'
      : `Generating variation ${state.genProgress + 1} of 5…`;
}

function setStatus(text, mode) {
  document.getElementById('statusText').textContent = text;
  const dot = document.getElementById('statusPill').querySelector('.status-dot');
  const colors = {
    perf: 'var(--sim-perf)',
    gen: 'var(--sim-gen)',
    alert: 'var(--sim-red)',
    execute: 'var(--sim-green)',
    done: 'var(--sim-green)',
    good: 'var(--sim-green)',
  };
  dot.style.background = colors[mode] || 'var(--sim-green)';
  dot.style.boxShadow = `0 0 0 4px ${STATUS_GLOW[mode] || STATUS_GLOW.good}`;
}

function setActiveAgent(which) {
  document.getElementById('chipPerf').classList.toggle('active-perf', which === 'perf' || which === 'handoff');
  document.getElementById('chipGen').classList.toggle('active-gen', which === 'gen' || which === 'handoff');
  document.getElementById('handoffArrow').classList.toggle('active', which === 'handoff' || which === 'gen');
}

function reveal(sectionId) {
  document.getElementById(sectionId).classList.add('show');
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

function advanceTime(seconds) {
  state.simTime = new Date(state.simTime.getTime() + seconds * 1000);
  document.getElementById('simClock').textContent = formatSimTime(state.simTime);
}

function getScript() {
  return [
    { delay: 0, action: 'log', type: 'perf', msg: 'Scanning 6 active creatives across Meta + TikTok placements' },
    { delay: 1800, action: 'log', type: 'perf', msg: 'REF-027 frequency 5.1 — flagged for watch' },
    { delay: 1800, action: 'metricUpdate', id: 'REF-014', changes: { ctr: 1.2, freq: 7.4, ctrDelta: -1 } },
    { delay: 200, action: 'status', text: 'Fatigue detected', mode: 'alert' },
    { delay: 100, action: 'log', type: 'perf-alert', msg: '⚠ REF-014 — CTR down 43% in 72h, freq 7.4 (limit 5.0)' },
    { delay: 1400, action: 'log', type: 'perf-think', msg: 'Cross-checking CVR — REF-014 dropped 3.8% → 2.6% over same window' },
    { delay: 1200, action: 'log', type: 'perf-think', msg: 'Pattern match: creative fatigue (3-of-3 indicators), confidence 92%' },
    { delay: 800, action: 'reveal', section: 'analysisSection' },
    { delay: 100, action: 'activeAgent', which: 'perf' },
    { delay: 100, action: 'status', text: 'Analyzing', mode: 'perf' },
    { delay: 1600, action: 'log', type: 'perf-think', msg: 'Decision: refresh asset. Preserve top-3 copy hooks from winners library.' },
    { delay: 1200, action: 'log', type: 'perf-think', msg: 'Pulling hooks · ranked by 28d CTR: "Lock in your lower rate" (2.4%), "$340/mo back" (2.1%), "Apply in 14 days" (1.9%)' },
    { delay: 1400, action: 'log', type: 'handoff', msg: '→ Triggering Creative Generation Agent via API (POST /generate · n=5)' },
    { delay: 100, action: 'activeAgent', which: 'handoff' },
    { delay: 800, action: 'reveal', section: 'genSection' },
    { delay: 200, action: 'activeAgent', which: 'gen' },
    { delay: 100, action: 'status', text: 'Generating', mode: 'gen' },
    { delay: 100, action: 'log', type: 'gen-active', msg: 'Generation Agent received brief — hooks, brand kit, audience, prior winners attached' },
    { delay: 600, action: 'genStart', idx: 0 },
    { delay: 100, action: 'log', type: 'gen', msg: 'Variation 1 · data-led layout · hook: "$340/mo back"' },
    { delay: 1800, action: 'genFinish', idx: 0 },
    { delay: 400, action: 'genStart', idx: 1 },
    { delay: 100, action: 'log', type: 'gen', msg: 'Variation 2 · big-number layout · hook: "Lock in your lower rate"' },
    { delay: 1600, action: 'genFinish', idx: 1 },
    { delay: 400, action: 'genStart', idx: 2 },
    { delay: 100, action: 'log', type: 'gen', msg: 'Variation 3 · bold-typography layout · new hook: "Less monthly. More monthly."' },
    { delay: 1600, action: 'genFinish', idx: 2 },
    { delay: 400, action: 'genStart', idx: 3 },
    { delay: 100, action: 'log', type: 'gen', msg: 'Variation 4 · lifestyle illustration · hook: "Apply in 14 days"' },
    { delay: 1600, action: 'genFinish', idx: 3 },
    { delay: 400, action: 'genStart', idx: 4 },
    { delay: 100, action: 'log', type: 'gen', msg: 'Variation 5 · minimal editorial · hook: "Lock in your lower rate"' },
    { delay: 1600, action: 'genFinish', idx: 4 },
    { delay: 800, action: 'log', type: 'gen-active', msg: 'Brand-safety scan — passed (no prohibited claims, disclaimer present)' },
    { delay: 800, action: 'log', type: 'gen-active', msg: 'Asset QA — passed (logo, contrast, headline length, CTA)' },
    { delay: 800, action: 'log', type: 'handoff', msg: '← Generation Agent returning 5 assets to Performance Agent' },
    { delay: 100, action: 'activeAgent', which: 'perf' },
    { delay: 100, action: 'status', text: 'Uploading', mode: 'perf' },
    { delay: 1000, action: 'log', type: 'perf', msg: 'Pausing fatigued creative REF-014' },
    { delay: 200, action: 'pauseCreative', id: 'REF-014' },
    { delay: 800, action: 'log', type: 'perf', msg: 'Uploading 5 variants to Meta Ads as test flight · equal-weight 7-day learning budget' },
    { delay: 1200, action: 'uploadDone' },
    { delay: 100, action: 'log', type: 'success', msg: '✓ Test flight TF-1142 live · audit entry written · #marketing-ops notified' },
    { delay: 1200, action: 'timeskip', hours: 48 },
    { delay: 100, action: 'log', type: 'perf', msg: 'Time +48h · evaluating test flight results' },
    { delay: 1200, action: 'log', type: 'success', msg: '✓ Variation 3 ("Less monthly. More monthly.") wins — CTR 2.9% (+38% vs control), CVR 4.1%' },
    { delay: 100, action: 'reveal', section: 'resultsSection' },
    { delay: 1000, action: 'log', type: 'success', msg: 'Auto-promoting V3 to primary · remaining variants moved to long-tail rotation · cycle complete' },
    { delay: 100, action: 'status', text: 'Cycle complete', mode: 'done' },
    { delay: 100, action: 'activeAgent', which: null },
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
  if (beat.delay > 300) advanceTime(Math.round((beat.delay / 1000) * 3));
  document.getElementById('simClock').textContent = formatSimTime(state.simTime);

  switch (beat.action) {
    case 'log':
      addLog(beat.type, beat.msg);
      break;
    case 'metricUpdate': {
      const c = state.creatives.find((x) => x.id === beat.id);
      Object.assign(c, beat.changes);
      renderCreatives();
      break;
    }
    case 'pauseCreative': {
      const c = state.creatives.find((x) => x.id === beat.id);
      c.status = 'paused';
      renderCreatives();
      break;
    }
    case 'status':
      setStatus(beat.text, beat.mode);
      break;
    case 'activeAgent':
      setActiveAgent(beat.which);
      break;
    case 'reveal':
      reveal(beat.section);
      break;
    case 'genStart':
      startGenerating(beat.idx);
      break;
    case 'genFinish':
      finishGenerating(beat.idx);
      break;
    case 'uploadDone': {
      const card = document.getElementById('uploadCard');
      card.classList.add('success');
      document.getElementById('uploadStatus').innerHTML =
        'TF-1142 live · 5 variants · equal-weight 7d budget';
      document.getElementById('uploadMeta').innerHTML = `<b>uploaded ${state.simTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</b>`;
      break;
    }
    case 'timeskip':
      advanceTime(beat.hours * 3600);
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
  document.querySelectorAll('.reveal').forEach((el) => el.classList.remove('show'));
  document.getElementById('uploadCard').classList.remove('success');
  document.getElementById('uploadStatus').textContent = 'awaiting completion';
  document.getElementById('uploadMeta').innerHTML = '';
  document.getElementById('genProgressLabel').textContent = 'Generation pending';
  document.getElementById('genProgressCount').textContent = '0 / 5';
  document.getElementById('simClock').textContent = formatSimTime(state.simTime);
  setStatus('Monitoring', 'good');
  setActiveAgent(null);
  renderCreatives();
  initGenGrid();
}

function initCreativeAgent() {
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
  renderCreatives();
  initGenGrid();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCreativeAgent);
} else {
  initCreativeAgent();
}
