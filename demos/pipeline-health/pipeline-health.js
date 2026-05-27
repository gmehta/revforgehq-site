/* Pipeline Health & Forecast Agent — client-side simulation */
(function () {
  'use strict';
// ============================================================
// State
// ============================================================
const INGEST_DATA = {
  research: { line1: '12 new briefs', line2: '3 promoted to T1 · 5 active investigations' },
  outbound: { line1: '47 sequences active', line2: '8 replies · 3 meetings booked · 12 cancelled' },
  call:     { line1: '19 calls analyzed', line2: '14 MEDDIC complete · 3 Champion gaps flagged' },
  desk:     { line1: '4 redline cycles', line2: '1 escalation (NW § 14.1) · 2 MAPs updated' },
};

let state, speed = 1, script = [], scriptIdx = 0;

function initState() {
  state = {
    playing: false,
    simTime: new Date(2026, 9, 19, 7, 0, 0),  // Mon Oct 19, 7:00am PT
    logs: [],
    ingested: 0,
    risksFlagged: 0,
  };
}

// ============================================================
// Render helpers
// ============================================================
function ingestFrom(agent) {
  const lane = document.getElementById('lane-' + agent);
  const status = lane.querySelector('.lane-status');
  const count = document.getElementById('count-' + agent);
  lane.classList.add('receiving');
  status.textContent = 'receiving…';
  setTimeout(() => {
    lane.classList.remove('receiving');
    lane.classList.add('received');
    status.textContent = '✓ received';
    const d = INGEST_DATA[agent];
    count.innerHTML = `<div><b>${d.line1}</b></div><div style="color: var(--text-dim); font-size: 10px;">${d.line2}</div>`;
    state.ingested++;
  }, 600);
}

function flagDeal(dealId, riskType) {
  const deal = document.getElementById(dealId);
  if (!deal) return;
  deal.dataset.flag = 'firing';
  deal.dataset.risk = riskType;
  setTimeout(() => { deal.dataset.flag = ''; }, 1500);
  state.risksFlagged++;
  updateRiskCounters();
}

function updateRiskCounters() {
  document.getElementById('cRisk').textContent = state.risksFlagged;
  // ARR exposure: NW 1.6 + VT 0.72 + AE 0.84 + AX 0.98 = $4.14M total
  const exposureMap = [0, 980, 1700, 2540, 4140];
  const exp = exposureMap[Math.min(state.risksFlagged, 4)];
  document.getElementById('cExposure').textContent = `$${(exp/1000).toFixed(1)}M`;
  const pct = ((exp / 7000) * 100).toFixed(0);
  document.getElementById('cExposurePct').textContent = `${pct}% of weighted forecast`;
}
function setReps(n) {
  document.getElementById('cReps').textContent = n;
}
function setConcen(pct) {
  document.getElementById('cConcen').textContent = pct + '%';
}

function showSynth(text) {
  document.getElementById('synthText').textContent = text;
  document.getElementById('synth').classList.add('show');
}
function doneSynth(text) {
  document.getElementById('synth').classList.add('done');
  document.getElementById('synthText').textContent = text;
}

function showBriefSection(id) {
  document.getElementById('bs-' + id).classList.add('show');
}
function showCoachCard(id) {
  document.getElementById('cc-' + id).classList.add('show');
}
function showRec(agent) {
  document.getElementById('rec-' + agent).classList.add('show');
}
function distribute(channel) {
  document.getElementById('dist-' + channel).classList.add('sent');
}

function setStatus(text, mode) {
  document.getElementById('statusText').textContent = text;
  const dot = document.getElementById('statusPill').querySelector('.status-dot');
  const colors = {
    scan: '#fb923c', ingest: '#fb923c', synth: '#fb923c',
    compose: '#fb923c', send: '#fb923c', done: '#6b9e78',
  };
  dot.style.background = colors[mode] || '#6b9e78';
  const shadows = {
    scan: 'rgba(251, 146, 60, 0.15)', ingest: 'rgba(251, 146, 60, 0.15)',
    synth: 'rgba(251, 146, 60, 0.15)', compose: 'rgba(251, 146, 60, 0.15)',
    send: 'rgba(251, 146, 60, 0.15)', done: 'rgba(74, 222, 128, 0.15)',
  };
  dot.style.boxShadow = `0 0 0 4px ${shadows[mode] || 'rgba(74, 222, 128, 0.15)'}`;
}

function addLog(type, msg) {
  const time = state.simTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  state.logs.push({ ts: time, type, msg });
  const body = document.getElementById('logBody');
  document.getElementById('logEmpty')?.remove();
  const el = document.createElement('div');
  el.className = 'log-entry ' + type;
  el.innerHTML = `<span class="ts">${time}</span><span class="msg">${msg}</span>`;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
  document.getElementById('logCount').textContent = state.logs.length + ' events';
}

function tickClock(min) {
  state.simTime = new Date(state.simTime.getTime() + min * 60 * 1000);
  updateClock();
}

function formatSimTime(d) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} PT`;
}
function updateClock() {
  document.getElementById('simClock').innerHTML = formatSimTime(state.simTime);
}

function setSeqSub(text) {
  document.getElementById('seqSub').textContent = text;
}

// ============================================================
// Script — the demo timeline
// ============================================================
function getScript() {
  return [
    // PHASE 1: Cycle starts
    { delay: 0, action: 'status', text: 'Scanning pipeline', mode: 'scan' },
    { delay: 100, action: 'log', type: 'ingest', msg: '★ Weekly pipeline cycle triggered · Mon 7:00 AM PT · 21 deals in motion' },
    { delay: 100, action: 'seqSub', text: 'scanning pipeline · ingesting agent data' },

    { delay: 700, action: 'log', type: 'scan', msg: 'Scanning 21 deals across 4 stages · weighted forecast baseline' },
    { delay: 100, action: 'setConcen', val: 62 },
    { delay: 600, action: 'log', type: 'scan', msg: 'Concentration calculated · top-3 deals = 62% of quarter (warning threshold)' },

    // PHASE 2: Ingest from 4 agents
    { delay: 700, action: 'status', text: 'Ingesting', mode: 'ingest' },
    { delay: 100, action: 'log', type: 'ingest', msg: '← Pulling 7-day data from operational agents' },

    { delay: 600, action: 'ingestFrom', agent: 'research' },
    { delay: 100, action: 'log', type: 'ingest', msg: '✓ Account Research · 12 briefs · 3 T1 promotions · 5 active' },

    { delay: 700, action: 'ingestFrom', agent: 'outbound' },
    { delay: 100, action: 'log', type: 'ingest', msg: '✓ Outbound Sequencing · 47 sequences · 8 replies · 3 meetings' },

    { delay: 700, action: 'ingestFrom', agent: 'call' },
    { delay: 100, action: 'log', type: 'ingest', msg: '✓ Call-to-CRM · 19 calls analyzed · 3 Champion gaps flagged' },

    { delay: 700, action: 'ingestFrom', agent: 'desk' },
    { delay: 100, action: 'log', type: 'ingest', msg: '✓ Deal Desk · 4 redline cycles · 1 escalation (NW § 14.1)' },

    // PHASE 3: Risk pattern detection
    { delay: 900, action: 'status', text: 'Detecting risks', mode: 'scan' },
    { delay: 100, action: 'log', type: 'scan', msg: 'Cross-deal risk detection · 21 deals × 7 risk patterns' },

    { delay: 800, action: 'flagDeal', dealId: 'd-apex', riskType: 'stalled' },
    { delay: 100, action: 'log', type: 'flag', msg: '⚠ Apex Robotics ($980K) · stalled · 18d no activity post-proposal' },
    { delay: 100, action: 'tickClock', min: 1 },

    { delay: 600, action: 'flagDeal', dealId: 'd-vertex', riskType: 'single-thread' },
    { delay: 100, action: 'log', type: 'flag', msg: '⚠ Vertex Mfg ($720K) · single-threaded · 47d at Director-level only' },

    { delay: 600, action: 'flagDeal', dealId: 'd-atlas', riskType: 'slipping' },
    { delay: 100, action: 'log', type: 'flag', msg: '⚠ Atlas Energy ($840K) · slipping · close pushed 3× · likely-lost pattern' },

    { delay: 600, action: 'flagDeal', dealId: 'd-northwind', riskType: 'security' },
    { delay: 100, action: 'log', type: 'flag', msg: '⚠ Northwind ($1.6M) · security review stalled · from Deal Desk Agent' },

    { delay: 700, action: 'log', type: 'synth', msg: '✓ 4 deals flagged · $4.1M ARR at risk · 59% of weighted forecast' },

    // PHASE 4: Synthesis (cross-deal pattern recognition)
    { delay: 900, action: 'status', text: 'Synthesizing', mode: 'synth' },
    { delay: 100, action: 'showSynth', text: 'Cross-deal pattern recognition · rep-level analysis · forecast modeling' },
    { delay: 100, action: 'log', type: 'synth', msg: 'Rep-level pattern scan · 5 AEs · 21 deals · 8-week trailing window' },

    { delay: 1200, action: 'log', type: 'synth', msg: '★ Pattern: Tom Williams has 2 of 3 Proposal-stage deals flagged · same root cause' },
    { delay: 100, action: 'setReps', n: 3 },
    { delay: 600, action: 'log', type: 'synth', msg: '★ Pattern: weak multi-threading across Tom\'s book · coachable, not bad luck' },
    { delay: 700, action: 'doneSynth', text: '✓ Synthesis complete · 4 risks · 1 pattern · drafting briefing' },

    // PHASE 5: Briefing composition
    { delay: 800, action: 'status', text: 'Composing', mode: 'compose' },
    { delay: 100, action: 'reveal', section: 'briefingSection' },

    { delay: 700, action: 'showBriefSection', id: 'tldr' },
    { delay: 100, action: 'log', type: 'compose', msg: 'Drafting · TL;DR' },

    { delay: 1200, action: 'showBriefSection', id: 'story' },
    { delay: 100, action: 'log', type: 'compose', msg: 'Drafting · the story this week (Northwind clearable blocker)' },

    { delay: 1300, action: 'showBriefSection', id: 'forecast' },
    { delay: 100, action: 'log', type: 'compose', msg: 'Drafting · quarter forecast (commit $6.8M)' },

    { delay: 1200, action: 'showBriefSection', id: 'watch' },
    { delay: 100, action: 'log', type: 'compose', msg: 'Drafting · 4 deals to watch' },

    { delay: 1300, action: 'showBriefSection', id: 'coaching' },
    { delay: 100, action: 'log', type: 'compose', msg: 'Drafting · rep-level coaching (Tom Williams pattern)' },

    { delay: 1200, action: 'showBriefSection', id: 'rec' },
    { delay: 100, action: 'log', type: 'compose', msg: 'Drafting · recommended moves (4 specific)' },

    { delay: 700, action: 'log', type: 'success', msg: '✓ Briefing complete · 6 sections · 487 words · 4 recommendations' },

    // PHASE 6: AE coaching cards
    { delay: 900, action: 'reveal', section: 'coachingListSection' },
    { delay: 100, action: 'log', type: 'compose', msg: '✎ Generating per-rep coaching surface · 3 cards' },

    { delay: 600, action: 'showCoachCard', id: 'tom' },
    { delay: 100, action: 'log', type: 'compose', msg: '→ Tom Williams · 2 deals · pattern flagged for 1:1' },

    { delay: 500, action: 'showCoachCard', id: 'maria' },
    { delay: 100, action: 'log', type: 'compose', msg: '→ Maria Garcia · 1 deal · diagnose before coaching' },

    { delay: 500, action: 'showCoachCard', id: 'sarah' },
    { delay: 100, action: 'log', type: 'compose', msg: '→ Sarah Chen · 1 deal · monitor (external blocker)' },

    // PHASE 7: Prescriptions to other agents (loop closure)
    { delay: 900, action: 'status', text: 'Closing loop', mode: 'send' },
    { delay: 100, action: 'log', type: 'send', msg: '→ Translating recommendations into prescriptions for operational agents' },
    { delay: 200, action: 'reveal', section: 'recsSection' },

    { delay: 700, action: 'showRec', agent: 'research' },
    { delay: 100, action: 'log', type: 'send', msg: '→ Account Research · backfill priority (3 T2 → T1 promotions)' },

    { delay: 500, action: 'showRec', agent: 'outbound' },
    { delay: 100, action: 'log', type: 'send', msg: '→ Outbound Sequencing · pause Atlas · re-engage Apex with new cadence' },

    { delay: 500, action: 'showRec', agent: 'call' },
    { delay: 100, action: 'log', type: 'send', msg: '→ Call-to-CRM · Champion prompt for all Discovery calls this week' },

    { delay: 500, action: 'showRec', agent: 'desk' },
    { delay: 100, action: 'log', type: 'send', msg: '→ Deal Desk · pre-load Meridian/Crescent precedents on 4 upcoming negotiations' },

    { delay: 700, action: 'log', type: 'success', msg: '✓ 4 prescriptions delivered · agents will pick up next cycle' },

    // PHASE 8: Distribution
    { delay: 900, action: 'log', type: 'send', msg: '↗ Distributing briefing to human destinations' },
    { delay: 100, action: 'reveal', section: 'distSection' },

    { delay: 500, action: 'distribute', channel: 'email' },
    { delay: 100, action: 'log', type: 'send', msg: '✓ Email · VP Sales David Kim' },

    { delay: 400, action: 'distribute', channel: 'slack' },
    { delay: 100, action: 'log', type: 'send', msg: '✓ Slack · #pipeline-leadership' },

    { delay: 400, action: 'distribute', channel: 'dash' },
    { delay: 100, action: 'log', type: 'send', msg: '✓ Dashboard · Q4 forecast tile updated' },

    { delay: 400, action: 'distribute', channel: 'coach' },
    { delay: 100, action: 'log', type: 'send', msg: '✓ 1:1 prep docs · 3 managers · stakeholder playbook attached for Tom' },

    { delay: 400, action: 'distribute', channel: 'archive' },
    { delay: 100, action: 'log', type: 'send', msg: '✓ Archived · briefing #w42 added to repository' },

    { delay: 1000, action: 'status', text: 'Cycle complete', mode: 'done' },
    { delay: 100, action: 'seqSub', text: 'complete · 4 risks · 3 coaching cards · 4 prescriptions' },
    { delay: 100, action: 'log', type: 'success', msg: '✓ Weekly cycle complete · next run: Monday Oct 26 · 7:00 AM PT' },
  ];
}

// ============================================================
// Scheduler
// ============================================================
function step() {
  if (!state.playing) return;
  if (scriptIdx >= script.length) { state.playing = false; setPlayButton(false); return; }
  const beat = script[scriptIdx++];
  setTimeout(() => {
    runBeat(beat);
    step();
  }, beat.delay / speed);
}

function runBeat(beat) {
  switch (beat.action) {
    case 'log':         addLog(beat.type, beat.msg); break;
    case 'ingestFrom':  ingestFrom(beat.agent); break;
    case 'flagDeal':    flagDeal(beat.dealId, beat.riskType); break;
    case 'setReps':     setReps(beat.n); break;
    case 'setConcen':   setConcen(beat.val); break;
    case 'showSynth':   showSynth(beat.text); break;
    case 'doneSynth':   doneSynth(beat.text); break;
    case 'showBriefSection': showBriefSection(beat.id); break;
    case 'showCoachCard': showCoachCard(beat.id); break;
    case 'showRec':     showRec(beat.agent); break;
    case 'distribute':  distribute(beat.channel); break;
    case 'status':      setStatus(beat.text, beat.mode); break;
    case 'reveal':      document.getElementById(beat.section).classList.add('show'); break;
    case 'seqSub':      setSeqSub(beat.text); break;
    case 'tickClock':   tickClock(beat.min); break;
  }
}

// ============================================================
// Controls
// ============================================================
function setPlayButton(playing) {
  document.getElementById('playBtn').innerHTML = playing
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
}
function play() { if (scriptIdx >= script.length) reset(); state.playing = true; setPlayButton(true); step(); }
function pause() { state.playing = false; setPlayButton(false); }
function reset() {
  pause();
  initState();
  script = getScript();
  scriptIdx = 0;
  document.getElementById('logBody').innerHTML = '<div class="log-empty" id="logEmpty">Press play to start simulation</div>';
  document.getElementById('logCount').textContent = '0 events';
  document.getElementById('seqSub').textContent = 'queued · awaiting trigger';

  // Reset counters
  document.getElementById('cRisk').textContent = '0';
  document.getElementById('cExposure').textContent = '$0';
  document.getElementById('cExposurePct').textContent = '% of weighted forecast';
  document.getElementById('cReps').textContent = '0';
  document.getElementById('cConcen').textContent = '—';

  // Reset deal flags
  ['d-apex','d-vertex','d-atlas','d-northwind'].forEach(id => {
    const d = document.getElementById(id);
    if (d) {
      d.dataset.flag = '';
      d.dataset.risk = '';
    }
  });

  // Reset ingest lanes
  ['research','outbound','call','desk'].forEach(a => {
    const lane = document.getElementById('lane-' + a);
    lane.classList.remove('received', 'receiving');
    lane.querySelector('.lane-status').textContent = 'queued';
    document.getElementById('count-' + a).textContent = '—';
  });

  // Reset synth
  const synth = document.getElementById('synth');
  synth.classList.remove('show', 'done');

  // Reset reveals
  document.querySelectorAll('.reveal').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.brief-section').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.coach-card').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.rec').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.dist').forEach(el => el.classList.remove('sent'));

  updateClock();
  setStatus('Ready', 'good');
}

document.getElementById('playBtn').addEventListener('click', () => state.playing ? pause() : play());
document.getElementById('resetBtn').addEventListener('click', reset);
document.querySelectorAll('#speedToggle button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#speedToggle button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    speed = parseInt(b.dataset.speed, 10);
  });
});

// Init
initState();
script = getScript();
updateClock();
  document.getElementById('hintReset')?.addEventListener('click', (e) => {
    e.preventDefault();
    reset();
  });
  document.querySelectorAll('#speedToggle button').forEach(b => {
    b.setAttribute('type', 'button');
  });
})();
