/* Call-to-CRM Agent — client-side simulation */
(function () {
  'use strict';
// ============================================================
// State
// ============================================================
let state, speed = 1, script = [], scriptIdx = 0;

function initState() {
  state = {
    playing: false,
    simTime: new Date(2026, 5, 3, 14, 0, 0),  // Wed Jun 3, 2:00pm PT
    callMin: 0,
    logs: [],
    fieldsFilled: 0,
  };
}

// ============================================================
// Render helpers
// ============================================================
function setStatus(text, mode) {
  document.getElementById('statusText').textContent = text;
  const dot = document.getElementById('statusPill').querySelector('.status-dot');
  const colors = {
    listen: '#a78bfa', extract: '#a78bfa',
    analyze: '#fbbf24', draft: '#a78bfa', done: '#6b9e78',
  };
  dot.style.background = colors[mode] || '#6b9e78';
  const shadows = {
    listen: 'rgba(167, 139, 250, 0.15)', extract: 'rgba(167, 139, 250, 0.15)',
    analyze: 'rgba(251, 191, 36, 0.15)', draft: 'rgba(167, 139, 250, 0.15)',
    done: 'rgba(74, 222, 128, 0.15)',
  };
  dot.style.boxShadow = `0 0 0 4px ${shadows[mode] || 'rgba(74, 222, 128, 0.15)'}`;
}

function setCallTime(min) {
  state.callMin = min;
  const mm = String(min).padStart(2, '0');
  document.getElementById('callTime').textContent = `${mm}:00`;
}

function endCall() {
  document.getElementById('callTimer').classList.add('ended');
  document.getElementById('callTime').textContent = '30:00 · ended';
}

function showBubble(id) {
  document.getElementById(id).classList.add('show');
}

function showBadge(id) {
  document.getElementById(id).classList.add('show');
}

function fillField(field, value, state) {
  const mc = document.getElementById('mc-' + field);
  if (state === 'filling') {
    mc.dataset.state = 'filling';
    mc.querySelector('.mc-value').textContent = 'filling…';
  } else if (state === 'complete') {
    mc.dataset.state = 'complete';
    mc.querySelector('.mc-value').innerHTML = value;
    mc.querySelector('.mc-icon').textContent = '●';
    state_filled_increment();
  } else if (state === 'missing') {
    mc.dataset.state = 'missing';
    mc.querySelector('.mc-value').textContent = value;
    mc.querySelector('.mc-icon').textContent = '⚠';
  }
}

function state_filled_increment() {
  state.fieldsFilled++;
  document.getElementById('scorecardProgress').textContent = `${state.fieldsFilled} / 7 fields complete`;
}

function showAction(id) {
  document.getElementById(id).classList.add('show');
}

function showHandoff(id) {
  document.getElementById('ho-' + id).classList.add('show');
}

function addLog(type, msg) {
  const time = `${String(state.callMin).padStart(2,'0')}:00`;
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
    // PHASE 1: Call setup
    { delay: 0, action: 'status', text: 'Listening', mode: 'listen' },
    { delay: 100, action: 'log', type: 'listen', msg: '✓ Call started · 2 participants joined · consent recorded' },
    { delay: 100, action: 'seqSub', text: 'live · transcribing + extracting' },
    { delay: 600, action: 'log', type: 'listen', msg: 'Speaker diarization active · Sarah Chen + Sarah Patel · context loaded' },

    // Phase 2: Bubble 1 — SC opens
    { delay: 800, action: 'showBubble', id: 'b1' },
    { delay: 100, action: 'callTime', min: 2 },

    // Bubble 2 — SP intros, Marcus mentioned
    { delay: 800, action: 'showBubble', id: 'b2' },
    { delay: 100, action: 'callTime', min: 3 },
    { delay: 500, action: 'showBadge', id: 'x2a' },
    { delay: 100, action: 'log', type: 'extract', msg: '◦ Entity extracted · Marcus Lee · VP Data Engineering (TB role inferred)' },

    // Bubble 3 — SC current state Q
    { delay: 700, action: 'showBubble', id: 'b3' },
    { delay: 100, action: 'callTime', min: 5 },

    // Bubble 4 — SP describes pain
    { delay: 800, action: 'showBubble', id: 'b4' },
    { delay: 100, action: 'callTime', min: 6 },
    { delay: 400, action: 'fillField', field: 'pain', stateName: 'filling' },
    { delay: 700, action: 'showBadge', id: 'x4a' },
    { delay: 100, action: 'log', type: 'extract', msg: '◦ MEDDIC · Pain → Oracle 8yrs · 5h+ ETL · 2yr internal pressure' },
    { delay: 100, action: 'fillField', field: 'pain', value: '<b>Oracle 8yrs</b> · 5h+ ETL windows · 2yr team escalation', stateName: 'complete' },

    // Bubble 5 — SC "why now" Q
    { delay: 700, action: 'showBubble', id: 'b5' },
    { delay: 100, action: 'callTime', min: 9 },

    // Bubble 6 — SP compelling event
    { delay: 800, action: 'showBubble', id: 'b6' },
    { delay: 100, action: 'callTime', min: 10 },
    { delay: 600, action: 'showBadge', id: 'x6a' },
    { delay: 100, action: 'log', type: 'extract', msg: '◦ Compelling event · Q1 regulatory data review · hard deadline' },

    // Bubble 7 — SC timing Q
    { delay: 700, action: 'showBubble', id: 'b7' },
    { delay: 100, action: 'callTime', min: 14 },

    // Bubble 8 — SP timeline
    { delay: 700, action: 'showBubble', id: 'b8' },
    { delay: 400, action: 'fillField', field: 'process', stateName: 'filling' },
    { delay: 600, action: 'showBadge', id: 'x8a' },
    { delay: 100, action: 'log', type: 'extract', msg: '◦ MEDDIC · Process → Q3 select · Q4 implement · Q1 milestone' },
    { delay: 100, action: 'fillField', field: 'process', value: '<b>Q3 select</b> · Q4 implement · Q1 migration milestone', stateName: 'complete' },

    // Bubble 9 — SC criteria Q
    { delay: 700, action: 'showBubble', id: 'b9' },
    { delay: 100, action: 'callTime', min: 18 },

    // Bubble 10 — SP three criteria
    { delay: 900, action: 'showBubble', id: 'b10' },
    { delay: 400, action: 'fillField', field: 'criteria', stateName: 'filling' },
    { delay: 100, action: 'fillField', field: 'metrics', stateName: 'filling' },
    { delay: 700, action: 'showBadge', id: 'x10a' },
    { delay: 100, action: 'log', type: 'extract', msg: '◦ MEDDIC · Criteria → TCO · governance · migration time' },
    { delay: 100, action: 'fillField', field: 'criteria', value: '<b>TCO at scale</b> · governance · migration time', stateName: 'complete' },

    { delay: 400, action: 'showBadge', id: 'x10b' },
    { delay: 100, action: 'log', type: 'extract', msg: '◦ MEDDIC · Metrics → 14 PB scale · 3× growth · regulated workloads' },
    { delay: 100, action: 'fillField', field: 'metrics', value: '<b>14 PB → 3×</b> · regulated workloads', stateName: 'complete' },

    // Bubble 11 — SC competition Q
    { delay: 700, action: 'showBubble', id: 'b11' },
    { delay: 100, action: 'callTime', min: 22 },

    // Bubble 12 — SP competitors
    { delay: 700, action: 'showBubble', id: 'b12' },
    { delay: 400, action: 'fillField', field: 'comp', stateName: 'filling' },
    { delay: 600, action: 'showBadge', id: 'x12a' },
    { delay: 100, action: 'log', type: 'extract', msg: '◦ MEDDIC · Competition → Snowflake · Databricks · +1' },
    { delay: 100, action: 'fillField', field: 'comp', value: '<b>Snowflake · Databricks</b> · +1 undisclosed', stateName: 'complete' },

    // Bubble 13 — SC budget Q
    { delay: 700, action: 'showBubble', id: 'b13' },
    { delay: 100, action: 'callTime', min: 25 },

    // Bubble 14 — SP buying process
    { delay: 800, action: 'showBubble', id: 'b14' },
    { delay: 400, action: 'fillField', field: 'econ', stateName: 'filling' },
    { delay: 600, action: 'showBadge', id: 'x14a' },
    { delay: 100, action: 'log', type: 'extract', msg: '◦ MEDDIC · Econ. buyer → David Chen · CFO · final-two gate' },
    { delay: 100, action: 'fillField', field: 'econ', value: '<b>David Chen · CFO</b> · approves at final-two', stateName: 'complete' },

    // Bubble 15 — SC next step
    { delay: 700, action: 'showBubble', id: 'b15' },
    { delay: 100, action: 'callTime', min: 28 },

    // Bubble 16 — SP agrees
    { delay: 700, action: 'showBubble', id: 'b16' },
    { delay: 100, action: 'callTime', min: 29 },
    { delay: 500, action: 'showBadge', id: 'x16a' },
    { delay: 100, action: 'log', type: 'extract', msg: '◦ Next step · technical deep-dive · Marcus Lee · 3 time options' },

    // PHASE 3: Call ends, coaching analysis
    { delay: 1000, action: 'log', type: 'listen', msg: '✓ Call ended · 30 min · 6 of 7 MEDDIC fields populated' },
    { delay: 100, action: 'endCall' },
    { delay: 100, action: 'seqSub', text: 'call ended · post-call analysis' },
    { delay: 800, action: 'status', text: 'Analyzing', mode: 'analyze' },
    { delay: 100, action: 'log', type: 'analyze', msg: 'Post-call gap analysis · cross-referencing 247-deal pattern library' },

    { delay: 1000, action: 'log', type: 'alert', msg: '⚠ Field gap detected · Champion not surfaced in 30 min' },
    { delay: 600, action: 'fillField', field: 'champ', value: '<b>not identified</b> · coaching action queued', stateName: 'missing' },
    { delay: 100, action: 'log', type: 'analyze', msg: 'Pattern lookup · 3.2× slip rate when Champion missing at discovery' },

    { delay: 800, action: 'reveal', section: 'coachingSection' },
    { delay: 600, action: 'log', type: 'analyze', msg: '✓ Coaching insight composed · 3 specific actions for next interaction' },
    { delay: 500, action: 'showAction', id: 'ca1' },
    { delay: 400, action: 'showAction', id: 'ca2' },
    { delay: 400, action: 'showAction', id: 'ca3' },

    // PHASE 4: Generate artifacts
    { delay: 900, action: 'status', text: 'Drafting', mode: 'draft' },
    { delay: 100, action: 'reveal', section: 'artifactsSection' },
    { delay: 100, action: 'log', type: 'draft', msg: '✎ Drafting follow-up email · recap + Champion probe inserted' },
    { delay: 800, action: 'log', type: 'draft', msg: '✓ Email drafted · 142 words · awaiting AE Sarah Chen review' },
    { delay: 600, action: 'log', type: 'draft', msg: '✎ Writing CRM updates · 9 field changes · 2 stakeholders added' },
    { delay: 700, action: 'log', type: 'success', msg: '✓ CRM updates staged · awaits AE approval before commit' },

    // PHASE 5: Handoff
    { delay: 900, action: 'reveal', section: 'handoffSection' },

    { delay: 500, action: 'showHandoff', id: 'ae' },
    { delay: 100, action: 'log', type: 'success', msg: '→ Delivered to AE inbox · estimated rep time saved: 35 min' },

    { delay: 500, action: 'showHandoff', id: 'pipeline' },
    { delay: 100, action: 'log', type: 'success', msg: '→ Pipeline Health Agent · deal advanced · risk flag registered' },

    { delay: 1000, action: 'status', text: 'Cycle complete', mode: 'done' },
    { delay: 100, action: 'seqSub', text: 'complete · 6/7 MEDDIC · 9 CRM updates · 1 coaching insight' },
    { delay: 100, action: 'log', type: 'success', msg: '✓ Call-to-CRM cycle complete · next call queued: Marcus tech deep-dive' },
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
    case 'showBubble':  showBubble(beat.id); break;
    case 'showBadge':   showBadge(beat.id); break;
    case 'fillField':   fillField(beat.field, beat.value, beat.stateName); break;
    case 'showAction':  showAction(beat.id); break;
    case 'showHandoff': showHandoff(beat.id); break;
    case 'callTime':    setCallTime(beat.min); break;
    case 'endCall':     endCall(); break;
    case 'status':      setStatus(beat.text, beat.mode); break;
    case 'reveal':      document.getElementById(beat.section).classList.add('show'); break;
    case 'seqSub':      setSeqSub(beat.text); break;
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
  document.getElementById('seqSub').textContent = 'connecting…';
  document.getElementById('scorecardProgress').textContent = '0 / 7 fields complete';
  document.getElementById('callTime').textContent = '00:00';
  document.getElementById('callTimer').classList.remove('ended');

  // Reset bubbles
  document.querySelectorAll('.bubble').forEach(b => b.classList.remove('show'));
  document.querySelectorAll('.extract-badge').forEach(b => b.classList.remove('show'));

  // Reset MEDDIC cards
  ['pain','process','criteria','metrics','econ','champ','comp'].forEach(f => {
    const mc = document.getElementById('mc-' + f);
    mc.dataset.state = 'empty';
    mc.querySelector('.mc-value').textContent = 'awaiting evidence';
    mc.querySelector('.mc-icon').textContent = '◯';
  });

  // Reset reveals
  document.querySelectorAll('.reveal').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.coaching-action').forEach(el => el.classList.remove('show'));
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
