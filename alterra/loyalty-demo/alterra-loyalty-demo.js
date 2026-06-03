/* Ikon Pass Loyalty & Retention Agent — Alterra prospect simulation */
(function () {
  'use strict';

  let state, speed = 1, script = [], scriptIdx = 0;

  function initState() {
    state = { playing: false, simTime: new Date(2026, 2, 8, 14, 0, 0), logs: [] };
  }

  function setCredits(used, total) {
    const bar = document.getElementById('creditsBar');
    const label = document.getElementById('creditsPct');
    const pct = Math.round((used / total) * 100);
    if (bar) bar.style.width = pct + '%';
    if (label) label.textContent = '$' + used + ' / $' + total;
    document.getElementById('creditsWrap')?.classList.toggle('urgent', total - used <= 50);
  }

  function showStitch(id) {
    document.getElementById(id)?.classList.add('show');
  }

  function streamOffer(id) {
    document.getElementById(id)?.classList.add('show');
  }

  function setTouchState(id, st) {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.state = st;
    const stEl = el.querySelector('.st');
    if (stEl) {
      const labels = { pending: 'Pending', drafting: 'Drafting', ready: 'Ready' };
      stEl.textContent = labels[st] || st;
    }
  }

  function showActivation() {
    document.getElementById('activationCard')?.classList.add('show');
  }

  function highlightPath(side) {
    document.getElementById('pathBatch')?.classList.toggle('dimmed', side === 'agent');
    document.getElementById('pathAgent')?.classList.toggle('active', side === 'agent');
    document.getElementById('pathBatch')?.classList.toggle('active', side === 'batch');
  }

  function setPanelSub(text) {
    document.getElementById('panelSub').textContent = text;
  }

  function setStatus(text, mode) {
    document.getElementById('statusText').textContent = text;
    const dot = document.getElementById('statusPill').querySelector('.status-dot');
    const colors = {
      monitor: '#c4a574',
      stitch: '#38bdf8',
      score: '#c4a574',
      compose: '#a78bfa',
      activate: '#6b9e78',
      done: '#6b9e78',
    };
    dot.style.background = colors[mode] || '#6b9e78';
    const shadows = {
      monitor: 'rgba(196, 165, 116, 0.15)',
      stitch: 'rgba(56, 189, 248, 0.15)',
      score: 'rgba(196, 165, 116, 0.15)',
      compose: 'rgba(167, 139, 250, 0.15)',
      activate: 'rgba(107, 158, 120, 0.15)',
      done: 'rgba(107, 158, 120, 0.15)',
    };
    dot.style.boxShadow = `0 0 0 4px ${shadows[mode] || 'rgba(107, 158, 120, 0.15)'}`;
  }

  function addLog(type, msg) {
    const time = state.simTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const date = state.simTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const body = document.getElementById('logBody');
    document.getElementById('logEmpty')?.remove();
    const el = document.createElement('div');
    el.className = 'log-entry ' + type;
    el.innerHTML = `<span class="ts">${date} ${time}</span><span class="msg">${msg}</span>`;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    document.getElementById('logCount').textContent = state.logs.length + 1 + ' events';
  }

  function formatSimTime(d) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} MT`;
  }

  function updateClock() {
    document.getElementById('simClock').innerHTML = formatSimTime(state.simTime);
  }

  function getScript() {
    return [
      { delay: 0, action: 'status', text: 'Scanning pass cohort', mode: 'monitor' },
      { delay: 100, action: 'log', type: 'scan', msg: '★ Loyalty scan · 26/27 renewal window · 48,200 Ikon Pass holders · Adobe RT-CDP' },
      { delay: 700, action: 'log', type: 'scan', msg: 'Ingesting eComm events · pass purchase · resort check-ins · Mountain Credits ledger' },
      { delay: 600, action: 'log', type: 'scan', msg: 'POS feed (Snowflake) · F&B + rental spend at Steamboat, Mammoth · identity key: pass_id' },
      { delay: 500, action: 'panelSub', text: 'scanning · 48,200 profiles' },

      { delay: 800, action: 'status', text: 'Identity stitch', mode: 'stitch' },
      { delay: 100, action: 'log', type: 'stitch', msg: '◦ Sarah M. · Ikon Pass · 14 resort days · credits $125/$300 unused · expires in 9 days' },
      { delay: 100, action: 'setCredits', used: 125, total: 300 },
      { delay: 700, action: 'reveal', section: 'creditsSection' },
      { delay: 100, action: 'reveal', section: 'stitchSection' },
      { delay: 100, action: 'showStitch', id: 'st1' },
      { delay: 100, action: 'log', type: 'stitch', msg: '→ EDDL · ikonpass.com purchase + login_id linked to pass_id (deterministic)' },
      { delay: 800, action: 'showStitch', id: 'st2' },
      { delay: 100, action: 'log', type: 'stitch', msg: '→ POS · Steamboat F&B $86 + Mammoth rental $142 merged into RT-CDP profile' },
      { delay: 800, action: 'showStitch', id: 'st3' },
      { delay: 100, action: 'log', type: 'stitch', msg: '✓ Unified profile · digital + on-mountain · LTV score 88 · churn risk: low-moderate' },

      { delay: 800, action: 'status', text: 'Scoring & offer logic', mode: 'score' },
      { delay: 100, action: 'reveal', section: 'pathSection' },
      { delay: 100, action: 'highlightPath', side: 'batch' },
      { delay: 100, action: 'log', type: 'invest', msg: '✗ Batch path: generic Renewal Rewards email · no POS context · credits buried in footer' },
      { delay: 900, action: 'highlightPath', side: 'agent' },
      { delay: 100, action: 'log', type: 'signal', msg: '✓ Agent path: Peak Perks + Mountain Credits urgency · resort-specific hook' },
      { delay: 700, action: 'reveal', section: 'offerSection' },
      { delay: 100, action: 'streamOffer', id: 'off1' },
      { delay: 100, action: 'log', type: 'compose', msg: '✎ Offer A · $50 bonus credit if redeemed at Steamboat this month (matches last visit)' },
      { delay: 800, action: 'streamOffer', id: 'off2' },
      { delay: 100, action: 'log', type: 'compose', msg: '✎ Offer B · Renewal Reward: Backcountry.com $100 + early renewal lock ($1,349)' },
      { delay: 800, action: 'streamOffer', id: 'off3' },
      { delay: 100, action: 'log', type: 'compose', msg: '✎ Guardrail · only claims with pass_id + POS match · no unsourced discount copy' },
      { delay: 600, action: 'panelSub', text: 'Sarah M. · 3 offers ranked' },

      { delay: 800, action: 'status', text: 'Activating journeys', mode: 'compose' },
      { delay: 100, action: 'reveal', section: 'journeySection' },
      { delay: 100, action: 'setTouchState', id: 'j1', st: 'drafting' },
      { delay: 100, action: 'log', type: 'compose', msg: '✎ SFMC Journey · email · Mountain Credits expire Mar 17 · Steamboat dining hook' },
      { delay: 900, action: 'setTouchState', id: 'j1', st: 'ready' },
      { delay: 100, action: 'setTouchState', id: 'j2', st: 'drafting' },
      { delay: 100, action: 'log', type: 'compose', msg: '✎ SMS · day 3 · unused $175 credits · one-tap wallet link (SendGrid transactional)' },
      { delay: 900, action: 'setTouchState', id: 'j2', st: 'ready' },
      { delay: 100, action: 'setTouchState', id: 'j3', st: 'drafting' },
      { delay: 100, action: 'log', type: 'compose', msg: '✎ In-app · ikonpass.com · personalized renewal module · HITL approve before send' },
      { delay: 900, action: 'setTouchState', id: 'j3', st: 'ready' },

      { delay: 800, action: 'status', text: 'Pushing to Adobe + SFMC', mode: 'activate' },
      { delay: 100, action: 'reveal', section: 'activationSection' },
      { delay: 100, action: 'showActivation' },
      { delay: 100, action: 'log', type: 'route', msg: '→ Adobe RT-CDP · audience "Credits_Urgent_Steamboat" · 12,400 similar profiles' },
      { delay: 700, action: 'log', type: 'route', msg: '→ Salesforce Marketing Cloud · journey version 3 · scheduled post-consent (OneTrust pass)' },
      { delay: 700, action: 'log', type: 'route', msg: '→ Loyalty ops queue · 1 package ready · est. manual research avoided: 5.5 hrs → 4 min' },

      { delay: 800, action: 'panelSub', text: 'activated · HITL approved' },
      { delay: 100, action: 'status', text: 'Cycle complete', mode: 'done' },
      { delay: 100, action: 'log', type: 'success', msg: '✓ Loyalty cycle complete · identity stitched · 3-touch journey · +$175 credit redemption forecast' },
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
    switch (beat.action) {
      case 'log':
        addLog(beat.type, beat.msg);
        break;
      case 'setCredits':
        setCredits(beat.used, beat.total);
        break;
      case 'showStitch':
        showStitch(beat.id);
        break;
      case 'streamOffer':
        streamOffer(beat.id);
        break;
      case 'setTouchState':
        setTouchState(beat.id, beat.st);
        break;
      case 'showActivation':
        showActivation();
        break;
      case 'highlightPath':
        highlightPath(beat.side);
        break;
      case 'status':
        setStatus(beat.text, beat.mode);
        break;
      case 'reveal':
        document.getElementById(beat.section).classList.add('show');
        break;
      case 'panelSub':
        setPanelSub(beat.text);
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
    state.logs = [];
    document.getElementById('logBody').innerHTML = '<div class="log-empty" id="logEmpty">Press play to run the loyalty agent</div>';
    document.getElementById('logCount').textContent = '0 events';
    document.getElementById('panelSub').textContent = 'awaiting scan';
    setCredits(125, 300);

    ['j1', 'j2', 'j3'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.dataset.state = 'pending';
        const stEl = el.querySelector('.st');
        if (stEl) stEl.textContent = 'Pending';
      }
    });

    document.querySelectorAll('.stitch-row, .offer-block').forEach((el) => el.classList.remove('show'));
    document.getElementById('activationCard')?.classList.remove('show');
    document.getElementById('creditsWrap')?.classList.remove('urgent');
    document.getElementById('pathBatch')?.classList.remove('active', 'dimmed');
    document.getElementById('pathAgent')?.classList.remove('active');
    document.querySelectorAll('.reveal').forEach((el) => el.classList.remove('show'));

    updateClock();
    setStatus('Ready', 'done');
  }

  document.getElementById('playBtn').addEventListener('click', () => (state.playing ? pause() : play()));
  document.getElementById('resetBtn').addEventListener('click', reset);
  document.getElementById('hintReset')?.addEventListener('click', (e) => {
    e.preventDefault();
    reset();
  });
  document.querySelectorAll('#speedToggle button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#speedToggle button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      speed = parseInt(b.dataset.speed, 10);
    });
  });

  initState();
  script = getScript();
  setCredits(125, 300);
  updateClock();
})();
