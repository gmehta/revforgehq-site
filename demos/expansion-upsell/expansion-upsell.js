/* Expansion & Upsell Agent — client-side simulation */
(function () {
  'use strict';

  let state, speed = 1, script = [], scriptIdx = 0;

  function initState() {
    state = {
      playing: false,
      simTime: new Date(2026, 6, 14, 9, 0, 0),
      logs: [],
    };
  }

  function setUsage(pct) {
    const bar = document.getElementById('usageBar');
    const label = document.getElementById('usagePct');
    if (bar) bar.style.width = pct + '%';
    if (label) label.textContent = pct + '%';
    document.getElementById('usageWrap')?.classList.toggle('hot', pct >= 80);
  }

  function showEnrich(id) {
    document.getElementById(id)?.classList.add('show');
  }

  function streamReport(id) {
    document.getElementById(id)?.classList.add('show');
  }

  function setSeqState(id, st) {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.state = st;
    const stEl = el.querySelector('.st');
    if (stEl) {
      const labels = { pending: 'Pending', drafting: 'Drafting', ready: 'Ready' };
      stEl.textContent = labels[st] || st;
    }
  }

  function showHandoff() {
    document.getElementById('aeHandoff')?.classList.add('show');
  }

  function highlightPath(side) {
    document.getElementById('pathCold')?.classList.toggle('dimmed', side === 'agent');
    document.getElementById('pathAgent')?.classList.toggle('active', side === 'agent');
    document.getElementById('pathCold')?.classList.toggle('active', side === 'cold');
  }

  function setPanelSub(text) {
    document.getElementById('panelSub').textContent = text;
  }

  function setStatus(text, mode) {
    document.getElementById('statusText').textContent = text;
    const dot = document.getElementById('statusPill').querySelector('.status-dot');
    const colors = {
      monitor: '#fb923c',
      trigger: '#fbbf24',
      enrich: '#38bdf8',
      synthesize: '#fb923c',
      compose: '#c4a574',
      route: '#a78bfa',
      done: '#6b9e78',
    };
    dot.style.background = colors[mode] || '#6b9e78';
    const shadows = {
      monitor: 'rgba(251, 146, 60, 0.15)',
      trigger: 'rgba(251, 191, 36, 0.15)',
      enrich: 'rgba(56, 189, 248, 0.15)',
      synthesize: 'rgba(251, 146, 60, 0.15)',
      compose: 'rgba(196, 165, 116, 0.15)',
      route: 'rgba(167, 139, 250, 0.15)',
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
      { delay: 0, action: 'status', text: 'Monitoring accounts', mode: 'monitor' },
      { delay: 100, action: 'log', type: 'scan', msg: '★ Expansion scan initiated · 1,240 LedgerCore Plus accounts · weekly cycle' },
      { delay: 700, action: 'log', type: 'scan', msg: 'Ingesting product usage · seats · API volume · feature adoption scores' },
      { delay: 600, action: 'log', type: 'scan', msg: 'Cross-referencing CRM · contract tier · renewal date · PQL queue (empty: 0 stale)' },
      { delay: 500, action: 'panelSub', text: 'scanning · 1,240 accounts' },

      { delay: 800, action: 'status', text: 'Threshold triggered', mode: 'trigger' },
      { delay: 100, action: 'log', type: 'signal', msg: '◦ Harbor & Co. flagged · 82% of Plus tier seat limit · +34% API volume WoW' },
      { delay: 100, action: 'setUsage', pct: 82 },
      { delay: 700, action: 'reveal', section: 'usageSection' },
      { delay: 100, action: 'log', type: 'signal', msg: '◦ Utility score: 91/100 · PayFlow + WorkforceHub modules active · 8 power users' },
      { delay: 600, action: 'log', type: 'invest', msg: '✓ PQL criteria met · expansion trigger · est. upsell ACV +$2.4K/mo → Enterprise tier' },
      { delay: 500, action: 'panelSub', text: 'Harbor & Co. · 82% capacity' },

      { delay: 800, action: 'status', text: 'Enriching account', mode: 'enrich' },
      { delay: 100, action: 'reveal', section: 'pathSection' },
      { delay: 100, action: 'highlightPath', side: 'cold' },
      { delay: 100, action: 'log', type: 'invest', msg: '✗ Cold PQL path: pass name to AE · no context · AE researches manually' },
      { delay: 900, action: 'highlightPath', side: 'agent' },
      { delay: 100, action: 'log', type: 'enrich', msg: '✓ Agent path: FirmGraph enrichment API · account + hiring signals' },
      { delay: 700, action: 'reveal', section: 'enrichSection' },
      { delay: 100, action: 'showEnrich', id: 'enr1' },
      { delay: 100, action: 'log', type: 'enrich', msg: '→ FirmGraph · 3 new Finance Ops hires in last 45 days · Seattle HQ' },
      { delay: 800, action: 'showEnrich', id: 'enr2' },
      { delay: 100, action: 'log', type: 'enrich', msg: '→ FirmGraph · Headcount +18% YoY · retail expansion noted in firmographic feed' },
      { delay: 800, action: 'showEnrich', id: 'enr3' },
      { delay: 100, action: 'log', type: 'enrich', msg: '→ Jordan Ellis promoted to Director of Finance · decision-maker signal strengthened' },

      { delay: 800, action: 'status', text: 'Synthesizing report', mode: 'synthesize' },
      { delay: 100, action: 'reveal', section: 'reportSection' },
      { delay: 100, action: 'streamReport', id: 'rep1' },
      { delay: 100, action: 'log', type: 'compose', msg: '✎ Expansion Readiness Report · section 1: usage & utility summary' },
      { delay: 800, action: 'streamReport', id: 'rep2' },
      { delay: 100, action: 'log', type: 'compose', msg: '✎ Section 2: enrichment signals · hiring + growth context' },
      { delay: 800, action: 'streamReport', id: 'rep3' },
      { delay: 100, action: 'log', type: 'compose', msg: '✎ Section 3: recommended tier · Enterprise + 5 seats · ROI framing' },
      { delay: 600, action: 'panelSub', text: 'report ready · scoring 94' },

      { delay: 800, action: 'status', text: 'Drafting AE sequence', mode: 'compose' },
      { delay: 100, action: 'reveal', section: 'sequenceSection' },
      { delay: 100, action: 'setSeqState', id: 'seq1', st: 'drafting' },
      { delay: 100, action: 'log', type: 'compose', msg: '✎ Touch 1 · email · lead with 82% capacity + API spike data' },
      { delay: 900, action: 'setSeqState', id: 'seq1', st: 'ready' },
      { delay: 100, action: 'setSeqState', id: 'seq2', st: 'drafting' },
      { delay: 100, action: 'log', type: 'compose', msg: '✎ Touch 2 · email · hiring signal hook · new Finance Ops team onboarding' },
      { delay: 900, action: 'setSeqState', id: 'seq2', st: 'ready' },
      { delay: 100, action: 'setSeqState', id: 'seq3', st: 'drafting' },
      { delay: 100, action: 'log', type: 'compose', msg: '✎ Touch 3 · call script · Enterprise tier ROI · Jordan Ellis + new hires' },
      { delay: 900, action: 'setSeqState', id: 'seq3', st: 'ready' },
      { delay: 100, action: 'log', type: 'compose', msg: '✓ 3-touch expansion sequence drafted · personalized to usage + enrichment' },

      { delay: 800, action: 'status', text: 'Routing to AE', mode: 'route' },
      { delay: 100, action: 'reveal', section: 'handoffSection' },
      { delay: 100, action: 'showHandoff' },
      { delay: 100, action: 'log', type: 'route', msg: '→ AE Riley Chen · Expansion Readiness Report attached · sequence pre-loaded in Outreach' },
      { delay: 700, action: 'log', type: 'route', msg: '→ CRM opportunity stub created · stage: Expansion Identified · no cold PQL handoff' },

      { delay: 800, action: 'panelSub', text: 'handed off · AE ready to send' },
      { delay: 100, action: 'status', text: 'Cycle complete', mode: 'done' },
      { delay: 100, action: 'log', type: 'success', msg: '✓ Expansion cycle complete · enriched PQL · report + sequence delivered · est. +$2.4K/mo ACV' },
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
      case 'setUsage':
        setUsage(beat.pct);
        break;
      case 'showEnrich':
        showEnrich(beat.id);
        break;
      case 'streamReport':
        streamReport(beat.id);
        break;
      case 'setSeqState':
        setSeqState(beat.id, beat.st);
        break;
      case 'showHandoff':
        showHandoff();
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
      case 'setSimTime':
        setSimTime(beat.year, beat.month, beat.day, beat.hour, beat.min);
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
    document.getElementById('logBody').innerHTML = '<div class="log-empty" id="logEmpty">Press play to start simulation</div>';
    document.getElementById('logCount').textContent = '0 events';
    document.getElementById('panelSub').textContent = 'awaiting scan';
    setUsage(64);

    ['seq1', 'seq2', 'seq3'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.dataset.state = 'pending';
        const stEl = el.querySelector('.st');
        if (stEl) stEl.textContent = 'Pending';
      }
    });

    document.querySelectorAll('.enrich-row, .report-block').forEach((el) => el.classList.remove('show'));
    document.getElementById('aeHandoff')?.classList.remove('show');
    document.getElementById('usageWrap')?.classList.remove('hot');
    document.getElementById('pathCold')?.classList.remove('active', 'dimmed');
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
  setUsage(64);
  updateClock();
})();
