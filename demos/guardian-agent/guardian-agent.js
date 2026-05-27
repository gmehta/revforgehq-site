// Guardian Agent — deterministic client-side simulation

const TILES = [
  { id: 'LP-01', label: '/refinance', type: 'lp' },
  { id: 'LP-02', label: '/rates', type: 'lp' },
  { id: 'LP-03', label: '/apply', type: 'lp' },
  { id: 'LP-04', label: '/refi-rate-2026', type: 'lp' },
  { id: 'LP-05', label: '/calculator', type: 'lp' },
  { id: 'LP-06', label: '/self-employed', type: 'lp' },
  { id: 'LP-07', label: '/cash-out', type: 'lp' },
  { id: 'LP-08', label: '/heloc', type: 'lp' },
  { id: 'PX-01', label: 'Meta · /apply', type: 'px' },
  { id: 'PX-02', label: 'Meta · /thank-you', type: 'px' },
  { id: 'PX-03', label: 'Meta · /apply (conv)', type: 'px' },
  { id: 'PX-04', label: 'Google · /apply', type: 'px' },
  { id: 'PX-05', label: 'Google · GTM', type: 'px' },
  { id: 'PX-06', label: 'TikTok · /apply', type: 'px' },
  { id: 'PX-07', label: 'Segment · web', type: 'px' },
  { id: 'PX-08', label: 'CAPI · server', type: 'px' },
  { id: 'BG-01', label: 'Meta · Q3 Search', type: 'bg' },
  { id: 'BG-02', label: 'Meta · Q3 Awareness', type: 'bg' },
  { id: 'BG-03', label: 'Meta · Retargeting', type: 'bg' },
  { id: 'BG-04', label: 'Google · Brand', type: 'bg' },
  { id: 'BG-05', label: 'Google · Refi-Intent', type: 'bg' },
  { id: 'BG-06', label: 'Google · YouTube', type: 'bg' },
  { id: 'BG-07', label: 'TikTok · Discovery', type: 'bg' },
  { id: 'BG-08', label: 'Programmatic · DSP', type: 'bg' },
  { id: 'AC-01', label: 'Meta Ads · auth', type: 'ac' },
  { id: 'AC-02', label: 'Google Ads · auth', type: 'ac' },
  { id: 'AC-03', label: 'TikTok · auth', type: 'ac' },
  { id: 'AC-04', label: 'Meta · billing', type: 'ac' },
  { id: 'AC-05', label: 'Google · billing', type: 'ac' },
  { id: 'AC-06', label: 'Meta · disapprovals', type: 'ac' },
  { id: 'AC-07', label: 'Google · disapprovals', type: 'ac' },
  { id: 'AC-08', label: 'Domain DNS', type: 'ac' },
];

let state;
let speed = 1;
let script = [];
let scriptIdx = 0;

const STATUS_GLOW = {
  detect: 'rgba(148, 148, 196, 0.15)',
  alert: 'rgba(184, 92, 92, 0.15)',
  action: 'rgba(196, 165, 116, 0.15)',
  done: 'rgba(107, 158, 120, 0.15)',
  good: 'rgba(107, 158, 120, 0.15)',
};

function initState() {
  state = {
    playing: false,
    simTime: new Date(2026, 4, 30, 8, 32, 14),
    logs: [],
    pingCount: 14247,
    incidentCount: 0,
    pausedCount: 0,
    activeIncidents: [],
  };
}

function renderBoard() {
  document.getElementById('board').innerHTML = TILES.map(
    (t) => `
    <div class="tile" id="tile-${t.id}">
      <div class="tile-row">
        <span class="tile-id">${t.id}</span>
        <span class="tile-dot"></span>
      </div>
      <div class="tile-meta">${t.label}</div>
    </div>
  `,
  ).join('');
}

function flashCheck(id) {
  const el = document.getElementById(`tile-${id}`);
  if (!el) return;
  el.classList.add('checking');
  state.pingCount++;
  document.getElementById('op-pings').textContent = state.pingCount.toLocaleString();
  setTimeout(() => el.classList.remove('checking'), 700);
}

function flashRandomChecks(n) {
  const shuffled = [...TILES].sort(() => Math.random() - 0.5).slice(0, n);
  shuffled.forEach((t, i) => setTimeout(() => flashCheck(t.id), i * 80));
}

function markTile(id, kind) {
  const el = document.getElementById(`tile-${id}`);
  if (!el) return;
  el.classList.remove('checking', 'failed', 'warn', 'paused');
  if (kind) el.classList.add(kind);
}

function setStatus(text, mode) {
  document.getElementById('statusText').textContent = text;
  const dot = document.getElementById('statusPill').querySelector('.status-dot');
  const colors = {
    detect: 'var(--sim-accent)',
    alert: 'var(--sim-red)',
    action: 'var(--sim-amber)',
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

function createIncident(opts) {
  const { id, severity, title, detail, actions, ticketId, ticketSummary, ticketTeam } = opts;
  state.incidentCount++;
  document.getElementById('op-incidents').textContent = state.incidentCount;
  document.getElementById('op-incidents').className = 'ops-value alert';
  document.getElementById('incidentsCount').textContent = `${state.incidentCount} open`;
  document.getElementById('incidentsEmpty').classList.add('hide');

  const wrap = document.getElementById('incidents');
  const sevCls = `severity-${severity}`;
  const sevLabel = severity.toUpperCase();
  const actionsHtml = actions
    .map(
      (a, i) => `
    <div class="inc-action" id="${id}-act-${i}">
      <div class="inc-action-check">✓</div>
      <span>${a}</span>
    </div>
  `,
    )
    .join('');

  const ticketHtml = ticketId
    ? `
    <div class="ticket" id="${id}-ticket">
      <div class="ticket-head">
        <span class="ticket-id">${ticketId}</span>
        <span class="ticket-status">CREATED</span>
      </div>
      <div class="ticket-summary">${ticketSummary}</div>
      <div class="ticket-meta">
        <span><b>severity:</b> ${sevLabel}</span>
        <span><b>team:</b> ${ticketTeam}</span>
        <span><b>via:</b> Jira + PagerDuty</span>
      </div>
    </div>
  `
    : '';

  wrap.insertAdjacentHTML(
    'beforeend',
    `
    <div class="incident ${sevCls}" id="${id}">
      <div class="inc-head">
        <div class="inc-id">
          <span class="sev-badge sev-${severity}">${sevLabel}</span>
          <span>${id}</span>
        </div>
        <span class="inc-elapsed" id="${id}-elapsed">just now</span>
      </div>
      <div class="inc-title">${title}</div>
      <div class="inc-detail">${detail}</div>
      <div class="inc-actions">${actionsHtml}</div>
      ${ticketHtml}
    </div>
  `,
  );
  state.activeIncidents.push(id);
}

function completeAction(incId, actIdx) {
  document.getElementById(`${incId}-act-${actIdx}`)?.classList.add('done');
}

function showTicket(incId) {
  document.getElementById(`${incId}-ticket`)?.classList.add('show');
}

function ackTicket(incId) {
  const el = document.getElementById(`${incId}-ticket`);
  if (!el) return;
  const status = el.querySelector('.ticket-status');
  status.textContent = "ACK'D";
  status.style.background = 'var(--sim-green-dim)';
  status.style.color = 'var(--sim-green)';
}

function pauseCampaigns(ids, count) {
  ids.forEach((id) => markTile(id, 'paused'));
  state.pausedCount += count;
  document.getElementById('op-paused').textContent = state.pausedCount;
}

function getScript() {
  return [
    { delay: 0, action: 'log', type: 'observe', msg: '32 endpoints under watch · check interval 60s · last full sweep clean' },
    { delay: 600, action: 'flashRandom', n: 4 },
    { delay: 800, action: 'flashRandom', n: 6 },
    { delay: 600, action: 'log', type: 'observe', msg: 'Sweep complete · 32/32 nominal · pixels firing at expected rate' },
    { delay: 700, action: 'flashRandom', n: 5 },

    { delay: 600, action: 'flashCheck', id: 'LP-04' },
    { delay: 100, action: 'log', type: 'detect', msg: '? LP-04 returned HTTP 404 (/refi-rate-2026) · re-checking…' },
    { delay: 800, action: 'flashCheck', id: 'LP-04' },
    { delay: 100, action: 'log', type: 'detect', msg: '? Retry 1/3 · 404 confirmed' },
    { delay: 700, action: 'flashCheck', id: 'LP-04' },
    { delay: 100, action: 'log', type: 'detect', msg: '? Retry 2/3 · 404 confirmed' },
    { delay: 700, action: 'flashCheck', id: 'LP-04' },
    { delay: 100, action: 'log', type: 'alert', msg: '✗ Retry 3/3 · LP-04 down · escalating' },
    { delay: 100, action: 'markTile', id: 'LP-04', kind: 'failed' },
    { delay: 100, action: 'status', text: 'Incident', mode: 'alert' },

    { delay: 700, action: 'log', type: 'alert', msg: 'INC-08213 created · landing page outage · 3 dependent ad groups identified' },
    {
      delay: 100,
      action: 'createIncident',
      opts: {
        id: 'INC-08213',
        severity: 'p1',
        title: 'Landing page outage · /refi-rate-2026',
        detail: 'HTTP 404 confirmed on 3 retries · receiving paid traffic from 3 ad groups · est. $1,840 spend at risk in next hour',
        actions: [
          'Pause 3 dependent ad groups (Meta + Google)',
          'Open P1 ticket · Marketing Engineering',
          'Page on-call via PagerDuty',
          'Notify #marketing-ops Slack',
        ],
        ticketId: 'MENG-4729',
        ticketSummary: 'Landing page /refi-rate-2026 returning 404 — paid traffic blocked, please investigate routing',
        ticketTeam: 'Marketing Engineering',
      },
    },

    { delay: 800, action: 'completeAction', incId: 'INC-08213', actIdx: 0 },
    { delay: 100, action: 'log', type: 'action', msg: '⏸ Paused: BG-04 (Google Brand), BG-05 (Google Refi-Intent), BG-01 (Meta Q3 Search)' },
    { delay: 100, action: 'pauseCampaigns', ids: ['BG-01', 'BG-04', 'BG-05'], count: 3 },

    { delay: 600, action: 'showTicket', incId: 'INC-08213' },
    { delay: 100, action: 'completeAction', incId: 'INC-08213', actIdx: 1 },
    { delay: 100, action: 'log', type: 'action', msg: '✓ Jira ticket MENG-4729 created · severity P1 · assigned marketing-eng on-call' },

    { delay: 500, action: 'completeAction', incId: 'INC-08213', actIdx: 2 },
    { delay: 100, action: 'log', type: 'action', msg: '✓ PagerDuty triggered · on-call paged · ack expected within 5min SLA' },

    { delay: 400, action: 'completeAction', incId: 'INC-08213', actIdx: 3 },
    { delay: 100, action: 'log', type: 'action', msg: '✓ Slack #marketing-ops notified with incident context' },

    { delay: 700, action: 'flashRandom', n: 6 },

    { delay: 600, action: 'flashCheck', id: 'BG-02' },
    { delay: 100, action: 'log', type: 'detect', msg: '? BG-02 hourly spend $4,247 vs 7d baseline $892 (+376%) · investigating' },
    { delay: 100, action: 'markTile', id: 'BG-02', kind: 'warn' },

    { delay: 800, action: 'log', type: 'detect', msg: 'Pulling change history · Meta Ad Set "Q3 Awareness"' },
    { delay: 800, action: 'log', type: 'alert', msg: '⚠ Daily budget changed 47min ago: $1,000 → $10,000 · likely typo (extra zero)' },

    { delay: 600, action: 'status', text: 'Anomaly · spend', mode: 'alert' },
    { delay: 100, action: 'log', type: 'alert', msg: 'INC-08214 created · spend anomaly · auto-reverting to last-known-good budget' },

    {
      delay: 100,
      action: 'createIncident',
      opts: {
        id: 'INC-08214',
        severity: 'p2',
        title: 'Spend anomaly · Meta Q3 Awareness · suspected budget typo',
        detail: 'Daily budget changed from $1,000 → $10,000 47min ago by user e.tran@bank.com · spend +376% vs baseline',
        actions: [
          'Revert budget to last-known-good ($1,000)',
          'Hold campaign until human ACK',
          'Open P2 ticket · Marketing Ops',
          'Notify campaign owner via email',
        ],
        ticketId: 'MOPS-1144',
        ticketSummary: 'Budget typo auto-reverted on Meta Q3 Awareness ($10K → $1K). Please confirm intended value.',
        ticketTeam: 'Marketing Ops',
      },
    },

    { delay: 700, action: 'completeAction', incId: 'INC-08214', actIdx: 0 },
    { delay: 100, action: 'log', type: 'action', msg: '↩ Budget reverted: $10,000 → $1,000 (last known good as of 09:45 AM)' },

    { delay: 500, action: 'completeAction', incId: 'INC-08214', actIdx: 1 },
    { delay: 100, action: 'log', type: 'action', msg: '⏸ Campaign held pending human ACK' },
    { delay: 100, action: 'markTile', id: 'BG-02', kind: 'paused' },
    { delay: 100, action: 'pauseCampaigns', ids: [], count: 1 },

    { delay: 500, action: 'showTicket', incId: 'INC-08214' },
    { delay: 100, action: 'completeAction', incId: 'INC-08214', actIdx: 2 },
    { delay: 500, action: 'completeAction', incId: 'INC-08214', actIdx: 3 },
    { delay: 100, action: 'log', type: 'action', msg: '✓ Owner emailed with diff + suggested action' },

    { delay: 700, action: 'flashRandom', n: 5 },

    { delay: 600, action: 'flashCheck', id: 'PX-03' },
    { delay: 100, action: 'log', type: 'detect', msg: '? PX-03 (Meta CAPI · /apply) event rate 0.4/min vs baseline 8.2/min (-95%)' },

    { delay: 700, action: 'log', type: 'detect', msg: 'Last successful fire: 14min ago · likely pixel removed or page change' },
    { delay: 100, action: 'markTile', id: 'PX-03', kind: 'failed' },

    { delay: 500, action: 'log', type: 'alert', msg: 'INC-08215 created · conversion tracking gap · pausing CVR-optimized campaigns' },
    { delay: 100, action: 'status', text: 'Tracking gap', mode: 'alert' },
    {
      delay: 100,
      action: 'createIncident',
      opts: {
        id: 'INC-08215',
        severity: 'p2',
        title: 'Pixel drop · Meta CAPI /apply',
        detail: 'Conversion events down 95% · 5 CVR-optimized campaigns will lose signal · pausing pre-emptively to protect bidding model',
        actions: [
          'Pause 5 CVR-optimized campaigns',
          'Open P2 ticket · Web Engineering',
          'Run diagnostic: GTM container · DOM probe',
          'Snapshot last-known-good config',
        ],
        ticketId: 'WEB-2208',
        ticketSummary: 'Meta CAPI not receiving /apply events. Last fire 14min ago. Likely page change or pixel removed in recent deploy.',
        ticketTeam: 'Web Engineering',
      },
    },

    { delay: 700, action: 'completeAction', incId: 'INC-08215', actIdx: 0 },
    { delay: 100, action: 'pauseCampaigns', ids: [], count: 5 },
    { delay: 100, action: 'log', type: 'action', msg: '⏸ 5 CVR-bid campaigns paused · prevents bidding-model corruption on bad signal' },

    { delay: 500, action: 'showTicket', incId: 'INC-08215' },
    { delay: 100, action: 'completeAction', incId: 'INC-08215', actIdx: 1 },
    { delay: 400, action: 'completeAction', incId: 'INC-08215', actIdx: 2 },
    { delay: 400, action: 'completeAction', incId: 'INC-08215', actIdx: 3 },

    { delay: 800, action: 'log', type: 'success', msg: "↩ MENG-4729 ACK'd by on-call (11min) · investigating routing config" },
    { delay: 100, action: 'ackTicket', incId: 'INC-08213' },

    { delay: 700, action: 'flashRandom', n: 5 },
    { delay: 500, action: 'log', type: 'success', msg: "↩ MOPS-1144 ACK'd by campaign owner (8min) · confirmed typo, original budget correct" },
    { delay: 100, action: 'ackTicket', incId: 'INC-08214' },

    { delay: 700, action: 'log', type: 'observe', msg: "Continuing watch · 28 endpoints nominal · 3 incidents in flight · 2 ACK'd" },

    { delay: 800, action: 'reveal', section: 'resultsSection' },
    { delay: 100, action: 'status', text: 'On watch', mode: 'detect' },
    { delay: 100, action: 'updateMTTR' },
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
    state.simTime = new Date(state.simTime.getTime() + Math.round(beat.delay / 1000) * 8 * 1000);
  }
  switch (beat.action) {
    case 'log':
      addLog(beat.type, beat.msg);
      break;
    case 'flashRandom':
      flashRandomChecks(beat.n);
      break;
    case 'flashCheck':
      flashCheck(beat.id);
      break;
    case 'markTile':
      markTile(beat.id, beat.kind);
      break;
    case 'status':
      setStatus(beat.text, beat.mode);
      break;
    case 'createIncident':
      createIncident(beat.opts);
      break;
    case 'completeAction':
      completeAction(beat.incId, beat.actIdx);
      break;
    case 'showTicket':
      showTicket(beat.incId);
      break;
    case 'ackTicket':
      ackTicket(beat.incId);
      break;
    case 'pauseCampaigns':
      pauseCampaigns(beat.ids, beat.count);
      break;
    case 'reveal':
      document.getElementById(beat.section).classList.add('show');
      break;
    case 'updateMTTR':
      document.getElementById('op-mttr').textContent = '11m';
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
  document.getElementById('incidents').innerHTML = '';
  document.getElementById('incidentsEmpty').classList.remove('hide');
  document.getElementById('incidentsCount').textContent = '0 open';
  document.getElementById('op-endpoints').textContent = '32';
  document.getElementById('op-pings').textContent = state.pingCount.toLocaleString();
  document.getElementById('op-incidents').textContent = '0';
  document.getElementById('op-incidents').className = 'ops-value ok';
  document.getElementById('op-paused').textContent = '0';
  document.getElementById('op-mttr').textContent = '—';
  document.getElementById('resultsSection').classList.remove('show');
  setStatus('Watching', 'good');
  renderBoard();
}

function initGuardianAgent() {
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
  renderBoard();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGuardianAgent);
} else {
  initGuardianAgent();
}
