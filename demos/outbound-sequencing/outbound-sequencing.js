/* Outbound Sequencing Agent — client-side simulation */
(function () {
  'use strict';

  let state, speed = 1, script = [], scriptIdx = 0;

  function initState() {
    state = {
      playing: false,
      simTime: new Date(2026, 4, 25, 14, 0, 0),
      daySeq: 0,
      logs: [],
    };
  }

  function setStepState(stepId, stateName) {
    document.getElementById(stepId).dataset.state = stateName;
  }
  function setStepContent(stepId, html) {
    document.getElementById(stepId + '-content').innerHTML = html;
  }
  function showEvent(eventId, label) {
    const el = document.getElementById(eventId);
    if (!el) return;
    el.classList.add('show');
    const span = el.querySelector('span:last-child');
    if (span) span.textContent = label;
  }

  function showApproval(text) {
    const el = document.getElementById('approval');
    document.getElementById('approvalText').textContent = text;
    el.classList.add('show');
  }
  function doneApproval(text) {
    const el = document.getElementById('approval');
    el.classList.add('done');
    document.getElementById('approvalText').textContent = text;
  }
  function hideApproval() {
    document.getElementById('approval').classList.remove('show');
  }

  function showPD(id) {
    document.querySelector(`[data-id="${id}"]`).classList.add('show');
  }

  function showRoute(id) {
    document.getElementById(id).classList.add('show');
  }

  function showHandoff(id) {
    document.getElementById('ho-' + id).classList.add('show');
  }

  function setStatus(text, mode) {
    document.getElementById('statusText').textContent = text;
    const dot = document.getElementById('statusPill').querySelector('.status-dot');
    const colors = {
      design: '#38bdf8', draft: '#38bdf8',
      approve: '#38bdf8', exec: '#38bdf8',
      hot: '#fbbf24', route: '#38bdf8', done: '#6b9e78',
    };
    dot.style.background = colors[mode] || '#6b9e78';
    const shadows = {
      design: 'rgba(56, 189, 248, 0.15)', draft: 'rgba(56, 189, 248, 0.15)',
      approve: 'rgba(56, 189, 248, 0.15)', exec: 'rgba(56, 189, 248, 0.15)',
      hot: 'rgba(251, 191, 36, 0.15)', route: 'rgba(56, 189, 248, 0.15)',
      done: 'rgba(107, 158, 120, 0.15)',
    };
    dot.style.boxShadow = `0 0 0 4px ${shadows[mode] || 'rgba(107, 158, 120, 0.15)'}`;
  }

  function addLog(type, msg) {
    const time = state.simTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const date = state.simTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    state.logs.push({ ts: `${date} ${time}`, type, msg });
    const body = document.getElementById('logBody');
    document.getElementById('logEmpty')?.remove();
    const el = document.createElement('div');
    el.className = 'log-entry ' + type;
    el.innerHTML = `<span class="ts">${date} ${time}</span><span class="msg">${msg}</span>`;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    document.getElementById('logCount').textContent = state.logs.length + ' events';
  }

  function setSimTime(year, month, day, hour, min) {
    state.simTime = new Date(year, month, day, hour, min, 0);
    updateClock();
  }

  function setDayInSequence(d) {
    state.daySeq = d;
    document.getElementById('dayInSeq').textContent = d;
  }

  function setSeqSub(text) {
    document.getElementById('seqSub').textContent = text;
  }

  function formatSimTime(d) {
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} PT`;
  }
  function updateClock() {
    document.getElementById('simClock').innerHTML = formatSimTime(state.simTime);
  }

  function getScript() {
    return [
      { delay: 0, action: 'status', text: 'Designing', mode: 'design' },
      { delay: 100, action: 'log', type: 'design', msg: '★ Trigger received from Account Research Agent · Northwind Pharma' },
      { delay: 700, action: 'log', type: 'design', msg: 'Loading account brief: 5 signals · warm path via Meridian · est. ACV $1.2–1.8M' },
      { delay: 700, action: 'log', type: 'design', msg: 'Selecting cadence variant · Enterprise Modernization v3 · warm-intro' },
      { delay: 600, action: 'seqSub', text: 'designing sequence · 6 touches' },
      { delay: 100, action: 'log', type: 'design', msg: 'Sequence skeleton: 6 touches · email × 3, LinkedIn × 2, phone × 1 · 14-day span' },

      { delay: 800, action: 'setStepState', stepId: 'step1', stateName: 'drafting' },
      { delay: 100, action: 'log', type: 'draft', msg: '✎ Drafting Step 1 · opener email' },
      { delay: 100, action: 'status', text: 'Drafting opener', mode: 'draft' },
      { delay: 100, action: 'reveal', section: 'personalSection' },

      { delay: 1000, action: 'showPD', id: 'pd1' },
      { delay: 100, action: 'log', type: 'draft', msg: '✓ Subject decision: warm-intro hook from CRM × LinkedIn graph' },

      { delay: 900, action: 'showPD', id: 'pd2' },
      { delay: 100, action: 'log', type: 'draft', msg: '✓ Opener decision: named reference Meridian (NPS 9 · pre-approved)' },

      { delay: 900, action: 'showPD', id: 'pd3' },
      { delay: 100, action: 'log', type: 'draft', msg: '✓ Body decision: technographic specifics from BuiltWith signal' },

      { delay: 900, action: 'showPD', id: 'pd4' },
      { delay: 100, action: 'log', type: 'draft', msg: '✓ Body decision: earnings quote (14 days old · CEO direct)' },

      { delay: 700, action: 'log', type: 'draft', msg: '✓ Opener complete · 147 words · brand-voice ✓ · 4 personalization decisions' },
      { delay: 500, action: 'setStepState', stepId: 'step1', stateName: 'queued' },
      { delay: 100, action: 'setStepContent', stepId: 'step1', html: '<b>"Sarah, Jen Wong suggested I reach out"</b>' },

      { delay: 600, action: 'log', type: 'design', msg: '✎ Drafting steps 2–6 (templates with account-specific fills)' },
      { delay: 500, action: 'setStepState', stepId: 'step2', stateName: 'queued' },
      { delay: 300, action: 'setStepState', stepId: 'step3', stateName: 'queued' },
      { delay: 300, action: 'setStepState', stepId: 'step4', stateName: 'queued' },
      { delay: 300, action: 'setStepState', stepId: 'step5', stateName: 'queued' },
      { delay: 300, action: 'setStepState', stepId: 'step6', stateName: 'queued' },
      { delay: 500, action: 'log', type: 'design', msg: '✓ Full sequence designed · 6 touches queued' },
      { delay: 100, action: 'seqSub', text: 'designed · awaiting approval' },

      { delay: 800, action: 'status', text: 'Awaiting approval', mode: 'approve' },
      { delay: 100, action: 'showApproval', text: 'Warm-intro variant · awaiting AE Sarah Chen approval (policy: required for warm paths)' },
      { delay: 100, action: 'log', type: 'design', msg: '⏸ Approval requested · AE Sarah Chen · warm-intro policy gate' },

      { delay: 1800, action: 'doneApproval', text: '✓ Approved by AE Sarah Chen · sequence active' },
      { delay: 100, action: 'log', type: 'success', msg: '✓ Sequence approved · activating in 30s window' },
      { delay: 100, action: 'seqSub', text: 'active · 6 touches scheduled' },

      { delay: 1000, action: 'hideApproval' },
      { delay: 100, action: 'status', text: 'Executing', mode: 'exec' },
      { delay: 100, action: 'setSimTime', year: 2026, month: 4, day: 25, hour: 14, min: 0 },
      { delay: 100, action: 'setDayInSequence', d: 0 },
      { delay: 100, action: 'setStepState', stepId: 'step1', stateName: 'sent' },
      { delay: 100, action: 'showEvent', eventId: 'step1-sent', label: 'sent 2:00 PM' },
      { delay: 100, action: 'log', type: 'send', msg: '→ Step 1 sent · Email opener · spatel@northwindpharma.com' },

      { delay: 1000, action: 'setSimTime', year: 2026, month: 4, day: 25, hour: 14, min: 6 },
      { delay: 100, action: 'showEvent', eventId: 'step1-opened', label: 'opened 2:06 PM (6m)' },
      { delay: 100, action: 'log', type: 'engage', msg: '◦ Email 1 opened · 6 min after send · iPhone Mail · NYC' },

      { delay: 1200, action: 'setSimTime', year: 2026, month: 4, day: 27, hour: 10, min: 0 },
      { delay: 100, action: 'setDayInSequence', d: 2 },
      { delay: 100, action: 'setStepState', stepId: 'step2', stateName: 'sent' },
      { delay: 100, action: 'showEvent', eventId: 'step2-sent', label: 'sent 10:00 AM' },
      { delay: 100, action: 'log', type: 'send', msg: '→ Step 2 sent · LinkedIn connection request' },

      { delay: 900, action: 'setSimTime', year: 2026, month: 4, day: 27, hour: 16, min: 15 },
      { delay: 100, action: 'showEvent', eventId: 'step2-opened', label: 'accepted 4:15 PM' },
      { delay: 100, action: 'log', type: 'engage', msg: '◦ LinkedIn connection accepted · same day' },

      { delay: 1200, action: 'setSimTime', year: 2026, month: 4, day: 29, hour: 9, min: 0 },
      { delay: 100, action: 'setDayInSequence', d: 4 },
      { delay: 100, action: 'setStepState', stepId: 'step3', stateName: 'sent' },
      { delay: 100, action: 'showEvent', eventId: 'step3-sent', label: 'sent 9:00 AM' },
      { delay: 100, action: 'log', type: 'send', msg: '→ Step 3 sent · Email "TCO trajectory at scale" + benchmark PDF' },

      { delay: 1000, action: 'setSimTime', year: 2026, month: 4, day: 29, hour: 11, min: 42 },
      { delay: 100, action: 'showEvent', eventId: 'step3-opened', label: 'opened 11:42 AM' },
      { delay: 100, action: 'log', type: 'engage', msg: '◦ Email 2 opened · clicked benchmark PDF · 18s read time' },

      { delay: 700, action: 'showEvent', eventId: 'step3-clicked', label: 'PDF clicked · 18s' },
      { delay: 100, action: 'log', type: 'engage', msg: '◦ PDF benchmark engagement · strong signal' },

      { delay: 1500, action: 'setSimTime', year: 2026, month: 5, day: 1, hour: 8, min: 14 },
      { delay: 100, action: 'setDayInSequence', d: 6 },
      { delay: 100, action: 'status', text: 'Reply intercepted', mode: 'hot' },
      { delay: 100, action: 'log', type: 'alert', msg: '★ REPLY received from Sarah Patel · 8:14 AM · before Step 4 fires' },
      { delay: 100, action: 'setStepState', stepId: 'step4', stateName: 'replied' },
      { delay: 100, action: 'showEvent', eventId: 'step4-replied', label: '↩ replied at 8:14 AM' },

      { delay: 800, action: 'reveal', section: 'triageSection' },
      { delay: 100, action: 'log', type: 'route', msg: '⚙ Classifying reply · sentiment + intent + key phrases' },

      { delay: 1000, action: 'log', type: 'route', msg: '✓ Class: INTERESTED · meeting requested · 96% confidence' },

      { delay: 700, action: 'status', text: 'Routing', mode: 'route' },
      { delay: 100, action: 'showRoute', id: 'r1' },
      { delay: 100, action: 'log', type: 'route', msg: '→ Routed to AE Sarah Chen · priority HOT' },

      { delay: 500, action: 'showRoute', id: 'r2' },
      { delay: 100, action: 'setStepState', stepId: 'step4', stateName: 'cancelled' },
      { delay: 100, action: 'log', type: 'cancel', msg: '◦ Step 4 cancelled · already replied · no value in case-study send' },

      { delay: 200, action: 'setStepState', stepId: 'step5', stateName: 'cancelled' },
      { delay: 100, action: 'log', type: 'cancel', msg: '◦ Step 5 cancelled · phone attempt unnecessary · prospect engaged' },

      { delay: 200, action: 'setStepState', stepId: 'step6', stateName: 'cancelled' },
      { delay: 100, action: 'log', type: 'cancel', msg: '◦ Step 6 cancelled · LinkedIn breakup not needed' },

      { delay: 500, action: 'showRoute', id: 'r3' },
      { delay: 100, action: 'log', type: 'route', msg: '→ Calendar query · 3 mutual slots Wed/Thu PM proposed' },

      { delay: 500, action: 'showRoute', id: 'r4' },
      { delay: 100, action: 'log', type: 'route', msg: '→ Slack #pipeline-hot-replies · summary posted' },

      { delay: 500, action: 'showRoute', id: 'r5' },
      { delay: 100, action: 'log', type: 'route', msg: '→ CRM stage advanced · Cold → Engaged · MEDDIC fields opened' },

      { delay: 500, action: 'showRoute', id: 'r6' },
      { delay: 100, action: 'log', type: 'route', msg: '→ Call-to-CRM Agent · context pack delivered · awaits call audio' },

      { delay: 1000, action: 'log', type: 'send', msg: 'AE Sarah Chen confirmed time · Wed Jun 3 · 2:00 PM PT' },
      { delay: 800, action: 'reveal', section: 'handoffSection' },

      { delay: 500, action: 'showHandoff', id: 'ae' },
      { delay: 100, action: 'log', type: 'send', msg: '✓ Meeting invite sent · discovery call confirmed' },

      { delay: 500, action: 'showHandoff', id: 'agent' },
      { delay: 100, action: 'log', type: 'send', msg: '✓ Call-to-CRM Agent queued · awaits Wednesday recording' },

      { delay: 1000, action: 'seqSub', text: 'complete · 1 reply · 0 wasted touches · meeting booked' },
      { delay: 100, action: 'status', text: 'Sequence complete', mode: 'done' },
      { delay: 100, action: 'log', type: 'success', msg: '✓ Outbound sequence complete · 3 of 6 touches sent · 1 reply · meeting booked in 9 days' },
    ];
  }

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
      case 'log': addLog(beat.type, beat.msg); break;
      case 'setStepState': setStepState(beat.stepId, beat.stateName); break;
      case 'setStepContent': setStepContent(beat.stepId, beat.html); break;
      case 'showEvent': showEvent(beat.eventId, beat.label); break;
      case 'showApproval': showApproval(beat.text); break;
      case 'doneApproval': doneApproval(beat.text); break;
      case 'hideApproval': hideApproval(); break;
      case 'showPD': showPD(beat.id); break;
      case 'showRoute': showRoute(beat.id); break;
      case 'showHandoff': showHandoff(beat.id); break;
      case 'status': setStatus(beat.text, beat.mode); break;
      case 'reveal': document.getElementById(beat.section).classList.add('show'); break;
      case 'setSimTime': setSimTime(beat.year, beat.month, beat.day, beat.hour, beat.min); break;
      case 'setDayInSequence': setDayInSequence(beat.d); break;
      case 'seqSub': setSeqSub(beat.text); break;
    }
  }

  function setPlayButton(playing) {
    document.getElementById('playBtn').innerHTML = playing
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
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
    document.getElementById('seqSub').textContent = 'queued · awaiting design';
    document.getElementById('dayInSeq').textContent = '0';

    ['step1','step2','step3','step4','step5','step6'].forEach(id => {
      document.getElementById(id).dataset.state = 'pending';
    });
    setStepContent('step1', 'Drafting opener…');
    document.querySelectorAll('.seq-event').forEach(e => {
      e.classList.remove('show');
      const span = e.querySelector('span:last-child');
      if (span) span.textContent = '—';
    });

    const ap = document.getElementById('approval');
    ap.classList.remove('show', 'done');

    document.querySelectorAll('.reveal').forEach(el => el.classList.remove('show'));
    document.querySelectorAll('.pd').forEach(el => el.classList.remove('show'));
    document.querySelectorAll('.route').forEach(el => el.classList.remove('show'));
    document.querySelectorAll('.handoff').forEach(el => el.classList.remove('show'));

    updateClock();
    setStatus('Ready', 'done');
  }

  document.getElementById('playBtn').addEventListener('click', () => state.playing ? pause() : play());
  document.getElementById('resetBtn').addEventListener('click', reset);
  document.getElementById('hintReset')?.addEventListener('click', (e) => {
    e.preventDefault();
    reset();
  });
  document.querySelectorAll('#speedToggle button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#speedToggle button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      speed = parseInt(b.dataset.speed, 10);
    });
  });

  initState();
  script = getScript();
  updateClock();
})();
