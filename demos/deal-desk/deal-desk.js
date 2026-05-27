/* Deal Desk Agent — client-side simulation */
(function () {
  'use strict';
// ============================================================
// State
// ============================================================
let state, speed = 1, script = [], scriptIdx = 0;

function initState() {
  state = {
    playing: false,
    simTime: new Date(2026, 9, 12, 9, 14, 0),  // Mon Oct 12, 9:14am PT
    logs: [],
    analyzed: 0,
  };
}

// ============================================================
// Render helpers
// ============================================================
function setStatus(text, mode) {
  document.getElementById('statusText').textContent = text;
  const dot = document.getElementById('statusPill').querySelector('.status-dot');
  const colors = {
    ingest: '#2dd4bf', classify: '#2dd4bf',
    escalate: '#fbbf24', draft: '#2dd4bf', done: '#6b9e78',
  };
  dot.style.background = colors[mode] || '#6b9e78';
  const shadows = {
    ingest: 'rgba(45, 212, 191, 0.15)', classify: 'rgba(45, 212, 191, 0.15)',
    escalate: 'rgba(251, 191, 36, 0.15)', draft: 'rgba(45, 212, 191, 0.15)',
    done: 'rgba(74, 222, 128, 0.15)',
  };
  dot.style.boxShadow = `0 0 0 4px ${shadows[mode] || 'rgba(74, 222, 128, 0.15)'}`;
}

function showClause(id) {
  document.getElementById(id).classList.add('show');
  state.analyzed++;
  document.getElementById('clauseProgress').textContent = `${state.analyzed} of 7 analyzed`;
}

function showPrecedent() {
  document.getElementById('precedent').classList.add('show');
}
function showCounter() {
  document.getElementById('ddCounter').classList.add('show');
}

function showRiskAction(id) {
  document.getElementById(id).classList.add('show');
}

function showHandoff(id) {
  document.getElementById('ho-' + id).classList.add('show');
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
    // PHASE 1: Trigger
    { delay: 0, action: 'status', text: 'Ingesting', mode: 'ingest' },
    { delay: 100, action: 'log', type: 'ingest', msg: '★ MSA-NW-2026-v3 redlines received from Northwind legal · 9:14 AM' },
    { delay: 600, action: 'log', type: 'ingest', msg: 'Parsing document · 47-page MSA · 14 textual changes detected · 7 substantive clauses' },
    { delay: 700, action: 'log', type: 'ingest', msg: 'Cross-referencing DataForge clause library · standard + fallback positions' },

    // PHASE 2: MAP context (already visible; just log)
    { delay: 700, action: 'log', type: 'ingest', msg: 'MAP loaded · 3 milestones done · 1 stalled (security review · 4d) · 4 upcoming' },
    { delay: 100, action: 'seqSub', text: 'analyzing 7 clauses · MAP loaded' },

    // PHASE 3: Clause-by-clause analysis
    { delay: 800, action: 'status', text: 'Classifying', mode: 'classify' },

    // Clause 1 — accept
    { delay: 100, action: 'showClause', id: 'c1' },
    { delay: 100, action: 'tickClock', min: 1 },
    { delay: 100, action: 'log', type: 'accept', msg: '✓ § 5.3 Confidentiality · 5yr survival · within fallback range · accept' },

    // Clause 2 — accept
    { delay: 700, action: 'showClause', id: 'c2' },
    { delay: 100, action: 'log', type: 'accept', msg: '✓ § 8.1 Data residency · US-east + EU-west · already supported · accept' },

    // Clause 3 — accept
    { delay: 700, action: 'showClause', id: 'c3' },
    { delay: 100, action: 'tickClock', min: 1 },
    { delay: 100, action: 'log', type: 'accept', msg: '✓ § 12.2 Termination · 60-day notice · within fallback · accept' },

    // Clause 4 — counter (within fallback)
    { delay: 800, action: 'showClause', id: 'c4' },
    { delay: 100, action: 'log', type: 'counter', msg: '↻ § 12.4 Auto-renewal · counter at 90-day opt-out · Atlas Energy precedent' },

    // Clause 5 — counter
    { delay: 800, action: 'showClause', id: 'c5' },
    { delay: 100, action: 'tickClock', min: 2 },
    { delay: 100, action: 'log', type: 'counter', msg: '↻ § 9.4 SLA credits · counter at 30%/60% · Crescent Health precedent' },

    // Clause 6 — ESCALATE (the wow setup)
    { delay: 800, action: 'showClause', id: 'c6' },
    { delay: 100, action: 'status', text: 'Escalating', mode: 'escalate' },
    { delay: 100, action: 'log', type: 'escalate', msg: '⚠ § 14.1 Limitation of Liability · NON-STANDARD · 3× cap + uncapped exception' },
    { delay: 600, action: 'log', type: 'escalate', msg: '⚠ Outside pre-approved fallback envelope · deep-dive analysis required' },

    // Clause 7 — counter
    { delay: 800, action: 'showClause', id: 'c7' },
    { delay: 100, action: 'log', type: 'counter', msg: '↻ § 11.2 Audit rights · counter biennial on-site · Crescent precedent' },
    { delay: 400, action: 'log', type: 'classify', msg: '✓ All 7 clauses classified · 3 accept · 3 counter · 1 escalate' },

    // PHASE 4: Critical clause deep-dive
    { delay: 800, action: 'log', type: 'escalate', msg: '⚙ Beginning deep-dive on § 14.1 · searching precedent archive' },
    { delay: 100, action: 'reveal', section: 'deepDiveSection' },

    { delay: 1000, action: 'log', type: 'precedent', msg: '⚙ Scanning 1,247 closed deals for liability-cap precedents · regulated industry' },
    { delay: 1000, action: 'tickClock', min: 1 },
    { delay: 100, action: 'log', type: 'precedent', msg: '★ Match found · Meridian Bank · Deal #DF-2024-0847 · 2× cap with regulated-data carve-out' },
    { delay: 100, action: 'showPrecedent' },

    { delay: 800, action: 'log', type: 'precedent', msg: '✓ Precedent verified · approved by Legal (Jane Rodriguez · Nov 2024)' },
    { delay: 600, action: 'log', type: 'precedent', msg: '✎ Drafting counter-language · adapting Meridian framing to Northwind scope' },
    { delay: 700, action: 'showCounter' },
    { delay: 100, action: 'tickClock', min: 1 },
    { delay: 100, action: 'log', type: 'precedent', msg: '✓ Counter drafted · 2× cap with willful-violation carve-out · within Legal policy 2024-RGP-12' },
    { delay: 600, action: 'log', type: 'route', msg: '→ § 14.1 routed to Jane Rodriguez · Slack DM · expected SLA: 2 business days' },

    // PHASE 5: MAP risk surface
    { delay: 1000, action: 'log', type: 'escalate', msg: '⚠ MAP risk detected · security review stalled · 4 days past scheduled' },
    { delay: 100, action: 'reveal', section: 'riskSection' },

    { delay: 700, action: 'showRiskAction', id: 'risk-a1' },
    { delay: 100, action: 'log', type: 'route', msg: '→ Auto-nudge drafted · Northwind CISO David Park · 3 slots proposed' },

    { delay: 500, action: 'showRiskAction', id: 'risk-a2' },
    { delay: 100, action: 'log', type: 'route', msg: '→ SOC2 questionnaire pre-filled · 47/52 from prior submissions · 5 await SE' },

    { delay: 500, action: 'showRiskAction', id: 'risk-a3' },
    { delay: 100, action: 'log', type: 'route', msg: '→ Calendar query sent · target re-schedule by Wed Oct 14' },

    // PHASE 6: Artifacts
    { delay: 900, action: 'status', text: 'Drafting return', mode: 'draft' },
    { delay: 100, action: 'reveal', section: 'artifactsSection' },
    { delay: 100, action: 'log', type: 'draft', msg: '✎ Compiling counter-redlines · MSA-NW-2026-v4 · 6 immediate + 1 pending Legal' },
    { delay: 800, action: 'tickClock', min: 1 },
    { delay: 100, action: 'log', type: 'draft', msg: '✓ Counter-document ready · approval routing computed · 3 owners' },
    { delay: 700, action: 'log', type: 'draft', msg: '✓ Standard clauses (3): AE signoff only · Counter clauses (3): same · § 14.1: Legal' },

    // PHASE 7: Handoff
    { delay: 800, action: 'reveal', section: 'handoffSection' },

    { delay: 500, action: 'showHandoff', id: 'ae' },
    { delay: 100, action: 'log', type: 'success', msg: '→ Delivered to AE Sarah Chen · est. review 15 min (vs 2hr unaided)' },

    { delay: 500, action: 'showHandoff', id: 'legal' },
    { delay: 100, action: 'log', type: 'success', msg: '→ Routed to Legal · Jane Rodriguez · Slack DM + precedent attached' },

    { delay: 500, action: 'showHandoff', id: 'pipeline' },
    { delay: 100, action: 'log', type: 'success', msg: '→ Pipeline Health Agent · status updated · security flag registered' },

    { delay: 1000, action: 'status', text: 'Cycle complete', mode: 'done' },
    { delay: 100, action: 'seqSub', text: 'complete · 6 immediate counters · 1 escalated · 1 risk surfaced' },
    { delay: 100, action: 'log', type: 'success', msg: '✓ Deal desk cycle complete · next check: Northwind response · target sign Oct 22' },
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
    case 'log':           addLog(beat.type, beat.msg); break;
    case 'showClause':    showClause(beat.id); break;
    case 'showPrecedent': showPrecedent(); break;
    case 'showCounter':   showCounter(); break;
    case 'showRiskAction': showRiskAction(beat.id); break;
    case 'showHandoff':   showHandoff(beat.id); break;
    case 'status':        setStatus(beat.text, beat.mode); break;
    case 'reveal':        document.getElementById(beat.section).classList.add('show'); break;
    case 'seqSub':        setSeqSub(beat.text); break;
    case 'tickClock':     tickClock(beat.min); break;
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
  document.getElementById('seqSub').textContent = 'redlines received · awaiting analysis';
  document.getElementById('clauseProgress').textContent = '0 of 7 analyzed';

  // Reset clauses
  document.querySelectorAll('.clause').forEach(c => c.classList.remove('show'));

  // Reset deep dive innards
  document.getElementById('precedent').classList.remove('show');
  document.getElementById('ddCounter').classList.remove('show');

  // Reset risk actions
  document.querySelectorAll('.map-risk-action').forEach(a => a.classList.remove('show'));

  // Reset reveals
  document.querySelectorAll('.reveal').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.handoff').forEach(el => el.classList.remove('show'));

  updateClock();
  setStatus('Ready', 'good');
}

document.getElementById('playBtn').addEventListener('click', () => state.playing ? pause() : play());
document.getElementById('resetBtn').addEventListener('click', reset);
document.querySelectorAll('#speedToggle button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#speedToggle button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    speed = parseInt(b.dataset.speed);
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
