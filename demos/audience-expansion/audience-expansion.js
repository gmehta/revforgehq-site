// Audience Management Agent — deterministic client-side simulation

const SEGMENTS = [
  { id: 'champions', name: 'High-Value Champions', type: 'seed', typeLabel: 'LAL SEED', count: 2847, syncs: ['M', 'G'] },
  { id: 'active', name: 'Active Applicants', type: 'active', typeLabel: 'FUNNEL', count: 14203, syncs: [] },
  { id: 'stalled', name: 'Stalled Applications', type: 'retarget', typeLabel: 'RETARGET', count: 6488, syncs: ['M', 'G'] },
  { id: 'converters', name: 'Recent Converters', type: 'exclusion', typeLabel: 'EXCLUDE 90d', count: 2148, syncs: ['M', 'G', 'T'] },
  { id: 'customers', name: 'All Customers', type: 'exclusion', typeLabel: 'GLOBAL EXCL', count: 184523, syncs: ['M', 'G', 'T'] },
];

let state;
let speed = 1;
let script = [];
let scriptIdx = 0;
let pushCounts = { meta: 0, google: 0, tiktok: 0 };

const STATUS_GLOW = {
  sync: 'rgba(94, 184, 196, 0.15)',
  detect: 'rgba(196, 165, 116, 0.15)',
  warn: 'rgba(196, 165, 116, 0.15)',
  done: 'rgba(107, 158, 120, 0.15)',
  good: 'rgba(107, 158, 120, 0.15)',
};

function initState() {
  state = {
    playing: false,
    simTime: new Date(2026, 4, 28, 11, 8, 42),
    segments: JSON.parse(JSON.stringify(SEGMENTS)),
    logs: [],
    eventCount: 0,
    syncCount: 0,
  };
  pushCounts = { meta: 0, google: 0, tiktok: 0 };
}

function renderSegments() {
  const el = document.getElementById('segments');
  el.innerHTML = state.segments
    .map((s) => {
      const syncChips = ['M', 'G', 'T']
        .map(
          (n) =>
            `<span class="sync-chip ${s.syncs.includes(n) ? 'pushed' : ''}">${n}</span>`,
        )
        .join('');
      return `<div class="seg" id="seg-${s.id}">
      <span class="seg-type ${s.type}">${s.typeLabel}</span>
      <div class="seg-name">${s.name}</div>
      <div class="seg-count">
        <span id="count-${s.id}">${s.count.toLocaleString()}</span>
        <span class="seg-delta" id="delta-${s.id}"></span>
      </div>
      <div class="seg-sync">${syncChips}</div>
    </div>`;
    })
    .join('');
}

function bumpSegment(id, delta) {
  const seg = state.segments.find((s) => s.id === id);
  seg.count += delta;
  const card = document.getElementById(`seg-${id}`);
  const countEl = document.getElementById(`count-${id}`);
  const deltaEl = document.getElementById(`delta-${id}`);
  card.classList.add('updating');
  countEl.textContent = seg.count.toLocaleString();
  deltaEl.textContent = (delta > 0 ? '+' : '') + delta;
  deltaEl.classList.remove('pos', 'neg', 'show');
  void deltaEl.offsetWidth;
  deltaEl.classList.add(delta > 0 ? 'pos' : 'neg', 'show');
  setTimeout(() => {
    card.classList.remove('updating');
    deltaEl.classList.remove('show');
  }, 1400);
}

function pushToNetwork(network, latency) {
  const row = document.getElementById(`net-${network}`);
  row.classList.add('syncing');
  pushCounts[network]++;
  document.getElementById(`${network}-pushes`).textContent = pushCounts[network];
  document.getElementById(`${network}-ms`).textContent = `${latency}ms`;
  state.syncCount++;
  updateOpsCount();
  setTimeout(() => row.classList.remove('syncing'), 600);
}

function updateOpsCount() {
  document.getElementById('opsCount').textContent = `${state.eventCount} events · ${state.syncCount} syncs`;
}

function setStatus(text, mode) {
  document.getElementById('statusText').textContent = text;
  const dot = document.getElementById('statusPill').querySelector('.status-dot');
  const colors = {
    sync: 'var(--sim-cyan)',
    detect: 'var(--sim-accent)',
    warn: 'var(--sim-amber)',
    done: 'var(--sim-green)',
    good: 'var(--sim-green)',
  };
  dot.style.background = colors[mode] || 'var(--sim-green)';
  dot.style.boxShadow = `0 0 0 4px ${STATUS_GLOW[mode] || STATUS_GLOW.good}`;
}

function addEvent(opts) {
  const { user, type, meta = '', kind = '' } = opts;
  state.eventCount++;
  updateOpsCount();
  const time = state.simTime.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const stream = document.getElementById('stream');
  const el = document.createElement('div');
  el.className = `ev ${kind}`;
  el.innerHTML = `<span class="ev-time">${time}</span><span class="ev-user">${user}</span><span class="ev-type">${type}</span><span class="ev-meta">${meta}</span>`;
  stream.prepend(el);
  while (stream.children.length > 30) stream.removeChild(stream.lastChild);
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

function showLAL(seed, lal, overlap) {
  const card = document.getElementById('lalCard');
  card.classList.add('show');
  document.getElementById('seedValue').textContent = seed.toLocaleString();
  document.getElementById('lalValue').textContent = `${(lal / 1000000).toFixed(2)}M`;
  document.getElementById('lalOverlap').textContent = `${overlap}% overlap`;
  const seedCluster = document.getElementById('seedCluster');
  if (!seedCluster.children.length) {
    seedCluster.innerHTML = Array.from({ length: 24 }, () => '<div class="dot"></div>').join('');
  }
  const lalCluster = document.getElementById('lalCluster');
  if (!lalCluster.children.length) {
    lalCluster.innerHTML = Array.from({ length: 72 }, () => '<div class="dot"></div>').join('');
  }
}

function formatSimTime(d) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })} PT`;
}

function updateClock() {
  document.getElementById('simClockTime').textContent = formatSimTime(state.simTime);
}

function uid() {
  const chars = '0123456789abcdef';
  let s = 'user_';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}

function getScript() {
  return [
    { delay: 0, action: 'log', type: 'observe', msg: 'Subscribed to 12 CDP event streams via Segment · 5 destination audiences mapped' },
    { delay: 800, action: 'event', user: uid(), type: 'page_view', meta: '/refinance' },
    { delay: 400, action: 'event', user: uid(), type: 'page_view', meta: '/rates' },
    { delay: 500, action: 'event', user: uid(), type: 'application_started', meta: '', kind: 'high-sig' },
    { delay: 100, action: 'bump', id: 'active', delta: +1 },
    { delay: 400, action: 'event', user: uid(), type: 'page_view', meta: '/refinance' },

    { delay: 700, action: 'event', user: 'user_1923', type: 'subscription_started', meta: 'ACV $1,240', kind: 'conversion' },
    { delay: 100, action: 'status', text: 'Conversion detected', mode: 'detect' },
    { delay: 100, action: 'log', type: 'detect', msg: '✓ Conversion · user_1923 · ACV $1,240 (high-value tier, threshold $1,000)' },

    { delay: 600, action: 'log', type: 'detect', msg: 'Segment transitions: Active → Recent Converters + Champions' },
    { delay: 100, action: 'bump', id: 'active', delta: -1 },
    { delay: 100, action: 'bump', id: 'converters', delta: +1 },
    { delay: 100, action: 'bump', id: 'champions', delta: +1 },
    { delay: 100, action: 'bump', id: 'customers', delta: +1 },

    { delay: 400, action: 'status', text: 'Syncing', mode: 'sync' },
    { delay: 100, action: 'log', type: 'sync', msg: '↗ Pushing exclusion to 3 networks in parallel' },
    { delay: 200, action: 'push', network: 'meta', latency: 27 },
    { delay: 80, action: 'push', network: 'google', latency: 41 },
    { delay: 60, action: 'push', network: 'tiktok', latency: 19 },
    { delay: 400, action: 'log', type: 'success', msg: '✓ Exclusions confirmed · Meta 27ms · Google 41ms · TikTok 19ms · awareness spend blocked' },

    { delay: 800, action: 'log', type: 'sync', msg: 'Refreshing 1% LAL seed (Champions cohort, +1 member)' },
    { delay: 600, action: 'showLAL', seed: 2848, lal: 2434000, overlap: 99.2 },
    { delay: 400, action: 'log', type: 'success', msg: '✓ LAL audience refreshed · 99.2% overlap with prior · 12K new prospects added' },

    { delay: 600, action: 'event', user: uid(), type: 'page_view', meta: '/calculator' },
    { delay: 300, action: 'event', user: uid(), type: 'email_opened', meta: 'reactivation_drip_3' },
    { delay: 400, action: 'event', user: uid(), type: 'application_started' },
    { delay: 100, action: 'bump', id: 'active', delta: +1 },

    { delay: 700, action: 'event', user: 'user_2847', type: 'trial_decay_d7', meta: 'no_login_168h', kind: 'stalled' },
    { delay: 100, action: 'status', text: 'Stalled cohort', mode: 'warn' },
    { delay: 100, action: 'log', type: 'detect', msg: '⚠ Trial decay · user_2847 · day 7, no login · moving to retention re-targeting' },

    { delay: 500, action: 'bump', id: 'active', delta: -1 },
    { delay: 100, action: 'bump', id: 'stalled', delta: +1 },

    { delay: 400, action: 'status', text: 'Syncing', mode: 'sync' },
    { delay: 100, action: 'log', type: 'sync', msg: '↗ Adding to RT-Stalled custom audience · Meta + Google' },
    { delay: 200, action: 'push', network: 'meta', latency: 24 },
    { delay: 80, action: 'push', network: 'google', latency: 38 },
    { delay: 400, action: 'log', type: 'success', msg: '✓ Retention re-targeting flight will pick up next opt cycle' },

    { delay: 800, action: 'log', type: 'observe', msg: 'Conversion burst detected — 4 in 6s' },

    { delay: 300, action: 'event', user: 'user_5102', type: 'subscription_started', meta: 'ACV $890', kind: 'conversion' },
    { delay: 80, action: 'bump', id: 'active', delta: -1 },
    { delay: 80, action: 'bump', id: 'converters', delta: +1 },
    { delay: 80, action: 'bump', id: 'customers', delta: +1 },
    { delay: 80, action: 'push', network: 'meta', latency: 31 },
    { delay: 40, action: 'push', network: 'google', latency: 45 },
    { delay: 40, action: 'push', network: 'tiktok', latency: 22 },

    { delay: 400, action: 'event', user: 'user_7740', type: 'subscription_started', meta: 'ACV $1,580', kind: 'conversion' },
    { delay: 80, action: 'bump', id: 'active', delta: -1 },
    { delay: 80, action: 'bump', id: 'converters', delta: +1 },
    { delay: 80, action: 'bump', id: 'champions', delta: +1 },
    { delay: 80, action: 'bump', id: 'customers', delta: +1 },
    { delay: 80, action: 'push', network: 'meta', latency: 29 },
    { delay: 40, action: 'push', network: 'google', latency: 43 },
    { delay: 40, action: 'push', network: 'tiktok', latency: 18 },

    { delay: 400, action: 'event', user: 'user_3214', type: 'subscription_started', meta: 'ACV $720', kind: 'conversion' },
    { delay: 80, action: 'bump', id: 'active', delta: -1 },
    { delay: 80, action: 'bump', id: 'converters', delta: +1 },
    { delay: 80, action: 'bump', id: 'customers', delta: +1 },
    { delay: 80, action: 'push', network: 'meta', latency: 26 },
    { delay: 40, action: 'push', network: 'google', latency: 40 },
    { delay: 40, action: 'push', network: 'tiktok', latency: 21 },

    { delay: 400, action: 'event', user: 'user_8861', type: 'subscription_started', meta: 'ACV $2,340', kind: 'conversion' },
    { delay: 80, action: 'bump', id: 'active', delta: -1 },
    { delay: 80, action: 'bump', id: 'converters', delta: +1 },
    { delay: 80, action: 'bump', id: 'champions', delta: +1 },
    { delay: 80, action: 'bump', id: 'customers', delta: +1 },
    { delay: 80, action: 'push', network: 'meta', latency: 33 },
    { delay: 40, action: 'push', network: 'google', latency: 47 },
    { delay: 40, action: 'push', network: 'tiktok', latency: 20 },

    { delay: 500, action: 'log', type: 'success', msg: '✓ Burst processed · 4 conversions · 12 network pushes · median latency 31ms · zero awareness spend on existing customers' },

    { delay: 600, action: 'log', type: 'sync', msg: 'Re-refreshing LAL seed (Champions +3 in burst)' },
    { delay: 400, action: 'showLAL', seed: 2851, lal: 2438000, overlap: 99.4 },

    { delay: 500, action: 'event', user: uid(), type: 'page_view', meta: '/refinance' },
    { delay: 300, action: 'event', user: uid(), type: 'application_started' },
    { delay: 100, action: 'bump', id: 'active', delta: +1 },
    { delay: 400, action: 'event', user: uid(), type: 'support_ticket' },

    { delay: 800, action: 'log', type: 'observe', msg: 'Time +24h · compiling daily summary' },
    { delay: 600, action: 'reveal', section: 'resultsSection' },
    { delay: 100, action: 'status', text: 'Cycle complete', mode: 'done' },
    { delay: 100, action: 'log', type: 'success', msg: '✓ 24h summary · 847 conversions excluded · $8.4K awareness spend prevented · LAL refreshed 4× · 148 stalled trials reactivated' },
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
  if (beat.delay > 200) {
    state.simTime = new Date(state.simTime.getTime() + Math.round(beat.delay / 1000) * 2 * 1000);
    updateClock();
  }
  switch (beat.action) {
    case 'log':
      addLog(beat.type, beat.msg);
      break;
    case 'event':
      addEvent({ user: beat.user, type: beat.type, meta: beat.meta || '', kind: beat.kind || '' });
      break;
    case 'bump':
      bumpSegment(beat.id, beat.delta);
      break;
    case 'push':
      pushToNetwork(beat.network, beat.latency);
      break;
    case 'status':
      setStatus(beat.text, beat.mode);
      break;
    case 'showLAL':
      showLAL(beat.seed, beat.lal, beat.overlap);
      break;
    case 'reveal':
      document.getElementById(beat.section).classList.add('show');
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
  document.getElementById('stream').innerHTML = '';
  document.getElementById('resultsSection').classList.remove('show');
  document.getElementById('lalCard').classList.remove('show');
  document.getElementById('seedCluster').innerHTML = '';
  document.getElementById('lalCluster').innerHTML = '';
  ['meta', 'google', 'tiktok'].forEach((n) => {
    document.getElementById(`${n}-pushes`).textContent = '0';
    document.getElementById(`${n}-ms`).textContent = '—';
  });
  updateOpsCount();
  updateClock();
  setStatus('Streaming', 'good');
  renderSegments();
}

function initAudienceExpansion() {
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
  renderSegments();
  updateClock();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAudienceExpansion);
} else {
  initAudienceExpansion();
}
