/* Trial-to-Paid Conversion Agent — client-side simulation */
(function () {
  'use strict';

  let state, speed = 1, script = [], scriptIdx = 0;

  function initState() {
    state = {
      playing: false,
      simTime: new Date(2026, 4, 28, 10, 0, 0),
      trialDay: 4,
      logs: [],
    };
  }

  function setTrackState(stepId, stateName) {
    const el = document.getElementById(stepId);
    if (el) el.dataset.state = stateName;
  }

  function showSignal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('show');
  }

  function highlightDecision(side) {
    document.getElementById('decisionBlind')?.classList.toggle('dimmed', side === 'agent');
    document.getElementById('decisionAgent')?.classList.toggle('active', side === 'agent');
    document.getElementById('decisionBlind')?.classList.toggle('active', side === 'blind');
  }

  function streamEmail(sectionId) {
    document.getElementById(sectionId)?.classList.add('show');
  }

  function showSlackCard() {
    document.getElementById('slackCard')?.classList.add('show');
  }

  function showTrait(id) {
    document.getElementById(id)?.classList.add('show');
  }

  function setPanelSub(text) {
    document.getElementById('panelSub').textContent = text;
  }

  function setTrialDay(d) {
    state.trialDay = d;
    document.getElementById('trialDay').textContent = d;
  }

  function setStatus(text, mode) {
    document.getElementById('statusText').textContent = text;
    const dot = document.getElementById('statusPill').querySelector('.status-dot');
    const colors = {
      monitor: '#2dd4bf',
      detect: '#2dd4bf',
      decide: '#fbbf24',
      intercept: '#f472b6',
      compose: '#2dd4bf',
      route: '#a78bfa',
      done: '#6b9e78',
    };
    dot.style.background = colors[mode] || '#6b9e78';
    const shadows = {
      monitor: 'rgba(45, 212, 191, 0.15)',
      detect: 'rgba(45, 212, 191, 0.15)',
      decide: 'rgba(251, 191, 36, 0.15)',
      intercept: 'rgba(244, 114, 182, 0.15)',
      compose: 'rgba(45, 212, 191, 0.15)',
      route: 'rgba(167, 139, 250, 0.15)',
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

  function formatSimTime(d) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} PT`;
  }

  function updateClock() {
    document.getElementById('simClock').innerHTML = formatSimTime(state.simTime);
  }

  function getScript() {
    return [
      { delay: 0, action: 'status', text: 'Monitoring cohort', mode: 'monitor' },
      { delay: 100, action: 'log', type: 'scan', msg: '★ Trial lifecycle scan initiated · 847 active LedgerCore Plus trials' },
      { delay: 700, action: 'log', type: 'scan', msg: 'Ingesting product telemetry · Segment · last 15 min window' },
      { delay: 600, action: 'log', type: 'scan', msg: 'Ingesting support queue · Zendesk · open tickets tagged trial' },
      { delay: 600, action: 'log', type: 'scan', msg: 'Cross-referencing lifecycle platform · 12 scheduled emails due in next 24h' },
      { delay: 500, action: 'panelSub', text: 'scanning · 847 trials' },

      { delay: 800, action: 'status', text: 'Detecting signals', mode: 'detect' },
      { delay: 100, action: 'log', type: 'signal', msg: '◦ Harbor & Co. flagged · Day 4 · source campaign ELM-9949 promo' },
      { delay: 700, action: 'reveal', section: 'signalsSection' },
      { delay: 100, action: 'showSignal', id: 'sig1' },
      { delay: 100, action: 'log', type: 'signal', msg: '◦ integration.connect_failed × 3 · PayFlow API · same user session' },
      { delay: 800, action: 'showSignal', id: 'sig2' },
      { delay: 100, action: 'log', type: 'signal', msg: '◦ Milestone incomplete · bank sync not started · Day 4 threshold breached' },
      { delay: 800, action: 'showSignal', id: 'sig3' },
      { delay: 100, action: 'log', type: 'signal', msg: '◦ Support ticket #8842 opened · "PayFlow connection keeps failing"' },
      { delay: 700, action: 'log', type: 'invest', msg: '✓ Intent score: HIGH · 3 retries in 47 min · est. ACV $840/mo if converted' },
      { delay: 500, action: 'panelSub', text: 'Harbor & Co. · 3 blocking signals' },

      { delay: 800, action: 'status', text: 'Evaluating intercept', mode: 'decide' },
      { delay: 100, action: 'log', type: 'invest', msg: '⚙ Day 7 upgrade nudge scheduled in 4h · generic template "Unlock advanced reports"' },
      { delay: 700, action: 'reveal', section: 'decisionSection' },
      { delay: 100, action: 'highlightDecision', side: 'blind' },
      { delay: 100, action: 'log', type: 'invest', msg: '✗ Blind path: send generic Day 7 email · ignores PayFlow blocker · high churn risk' },
      { delay: 900, action: 'highlightDecision', side: 'agent' },
      { delay: 100, action: 'log', type: 'invest', msg: '✓ Agent path: pause scheduled email · branch to intervention track v2' },

      { delay: 800, action: 'status', text: 'Intercepting track', mode: 'intercept' },
      { delay: 100, action: 'setTrackState', stepId: 'track-day7', stateName: 'paused' },
      { delay: 100, action: 'log', type: 'intercept', msg: '⏸ Lifecycle platform · Day 7 email PAUSED · reason: integration_blocker_detected' },
      { delay: 700, action: 'log', type: 'intercept', msg: '→ Branching to intervention track v2 · PayFlow recovery playbook' },
      { delay: 500, action: 'panelSub', text: 'Day 7 paused · intervention active' },

      { delay: 800, action: 'status', text: 'Composing outreach', mode: 'compose' },
      { delay: 100, action: 'reveal', section: 'emailSection' },
      { delay: 100, action: 'log', type: 'compose', msg: '✎ Parsing error log · 401 OAuth scope mismatch on /v3/connections/payflow' },
      { delay: 700, action: 'streamEmail', sectionId: 'emailSubject' },
      { delay: 100, action: 'log', type: 'compose', msg: '✓ Subject: specific to PayFlow setup failure (not generic upgrade)' },
      { delay: 800, action: 'streamEmail', sectionId: 'emailDiagnosis' },
      { delay: 100, action: 'log', type: 'compose', msg: '✓ Body: cites exact API error + missing oauth.payments scope' },
      { delay: 800, action: 'streamEmail', sectionId: 'emailSteps' },
      { delay: 100, action: 'log', type: 'compose', msg: '✓ Fix steps: reconnect flow + doc link · "Reply if still stuck"' },
      { delay: 700, action: 'streamEmail', sectionId: 'emailReasoning' },
      { delay: 100, action: 'log', type: 'compose', msg: '✓ Intervention email queued · send in 12 min (human-in-loop window)' },

      { delay: 800, action: 'status', text: 'Routing to CS', mode: 'route' },
      { delay: 100, action: 'reveal', section: 'slackSection' },
      { delay: 100, action: 'showSlackCard' },
      { delay: 100, action: 'log', type: 'route', msg: '→ Slack #cs-high-intent-trials · assigned to Maya Ortiz · full technical context attached' },
      { delay: 700, action: 'log', type: 'route', msg: '→ Talk track: "Saw 3 PayFlow retries — want to walk through OAuth scopes on a quick call?"' },

      { delay: 800, action: 'status', text: 'Updating CDP', mode: 'route' },
      { delay: 100, action: 'reveal', section: 'outcomeSection' },
      { delay: 100, action: 'showTrait', id: 'trait1' },
      { delay: 400, action: 'showTrait', id: 'trait2' },
      { delay: 400, action: 'showTrait', id: 'trait3' },
      { delay: 100, action: 'log', type: 'success', msg: '✓ Segment traits updated · lc_integration_blocked · lc_cs_intervention · lc_trial_risk_high' },
      { delay: 600, action: 'setTrackState', stepId: 'track-day10', stateName: 'modified' },
      { delay: 100, action: 'log', type: 'success', msg: '✓ Day 10 case study rescheduled · post-resolution variant · CS follow-up gate' },

      { delay: 800, action: 'panelSub', text: 'intervention complete · generic email avoided' },
      { delay: 100, action: 'status', text: 'Cycle complete', mode: 'done' },
      { delay: 100, action: 'log', type: 'success', msg: '✓ Trial-to-paid cycle complete · 1 generic email avoided · personalized fix sent · CS notified' },
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
      case 'setTrackState':
        setTrackState(beat.stepId, beat.stateName);
        break;
      case 'showSignal':
        showSignal(beat.id);
        break;
      case 'highlightDecision':
        highlightDecision(beat.side);
        break;
      case 'streamEmail':
        streamEmail(beat.sectionId);
        break;
      case 'showSlackCard':
        showSlackCard();
        break;
      case 'showTrait':
        showTrait(beat.id);
        break;
      case 'status':
        setStatus(beat.text, beat.mode);
        break;
      case 'reveal':
        document.getElementById(beat.section).classList.add('show');
        break;
      case 'setSimTime':
        setSimTime(beat.year, beat.month, beat.day, beat.hour, beat.min);
        break;
      case 'setTrialDay':
        setTrialDay(beat.d);
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
    document.getElementById('logBody').innerHTML = '<div class="log-empty" id="logEmpty">Press play to start simulation</div>';
    document.getElementById('logCount').textContent = '0 events';
    document.getElementById('panelSub').textContent = 'awaiting scan';
    document.getElementById('trialDay').textContent = '4';

    ['track-day1', 'track-day3', 'track-day7', 'track-day10'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === 'track-day1' || id === 'track-day3') el.dataset.state = 'sent';
      else if (id === 'track-day7') el.dataset.state = 'scheduled';
      else el.dataset.state = 'queued';
    });

    document.querySelectorAll('.signal-row').forEach((el) => el.classList.remove('show'));
    document.querySelectorAll('.email-block').forEach((el) => el.classList.remove('show'));
    document.getElementById('slackCard')?.classList.remove('show');
    document.querySelectorAll('.trait-chip').forEach((el) => el.classList.remove('show'));
    document.getElementById('decisionBlind')?.classList.remove('active', 'dimmed');
    document.getElementById('decisionAgent')?.classList.remove('active');

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
  updateClock();
})();
