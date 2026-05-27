/* Account Research & Prioritization Agent — client-side simulation */
(function () {
  'use strict';

  const ACCOUNT_COUNT = 200;

  const ACCOUNTS = (() => {
    const named = [
      { i: 0, ab: 'NW', tier: 1, hero: true },
      { i: 4, ab: 'AX', tier: 1 },
      { i: 10, ab: 'VT', tier: 1 },
      { i: 14, ab: 'HX', tier: 1 },
      { i: 18, ab: 'CL', tier: 1 },
      { i: 22, ab: 'MB', tier: 1, customer: true },
      { i: 26, ab: 'PS', tier: 1 },
      { i: 32, ab: 'AE', tier: 1 },
      { i: 36, ab: 'CH', tier: 1 },
      { i: 41, ab: 'QD', tier: 1 },
      { i: 88, ab: 'OR', tier: 1 },
      { i: 120, ab: 'SV', tier: 1 },
      { i: 2, ab: 'HI', tier: 2 },
      { i: 7, ab: 'SM', tier: 2 },
      { i: 9, ab: 'CN', tier: 2 },
      { i: 13, ab: 'FC', tier: 2 },
      { i: 16, ab: 'OA', tier: 2 },
      { i: 20, ab: 'TI', tier: 2 },
      { i: 25, ab: 'MR', tier: 2 },
      { i: 29, ab: 'CD', tier: 2 },
      { i: 31, ab: 'PM', tier: 2 },
      { i: 34, ab: 'MF', tier: 2 },
      { i: 38, ab: 'AH', tier: 2 },
      { i: 43, ab: 'BC', tier: 2 },
      { i: 45, ab: 'WR', tier: 2 },
      { i: 47, ab: 'LE', tier: 2 },
    ];
    const tiles = new Array(ACCOUNT_COUNT).fill(null);
    named.forEach((n) => { tiles[n.i] = n; });
    const codes = 'BL RD OY WN ZK VR MK TF GH UJ XP EQ NF DW YT OL VQ RZ BX MJ DK PT YN UH KC JW FN ST LP GR HV QW ZX NM'.split(' ');
    let codeIdx = 0;
    for (let i = 0; i < ACCOUNT_COUNT; i++) {
      if (!tiles[i]) {
        const ab = codes[codeIdx % codes.length] + (codeIdx >= codes.length ? String(Math.floor(codeIdx / codes.length)) : '');
        tiles[i] = { i, ab: ab.slice(0, 3), tier: 3 };
        codeIdx++;
      }
    }
    return tiles;
  })();

  let state;
  let speed = 1;
  let script = [];
  let scriptIdx = 0;

  function initState() {
    state = {
      playing: false,
      simTime: new Date(2026, 4, 25, 6, 0, 0),
      logs: [],
      signals: 0,
      rescored: 0,
      promos: 0,
      briefs: 0,
    };
  }

  function buildBoard() {
    const board = document.getElementById('board');
    if (!board) return;
    board.innerHTML = '';
    ACCOUNTS.forEach((acc) => {
      const t = document.createElement('div');
      t.className = 'tile';
      t.id = 'tile-' + acc.i;
      t.dataset.tier = acc.tier;
      if (acc.customer) t.dataset.customer = 'true';
      t.innerHTML = `
        <div class="tile-dot"></div>
        <div class="tile-abbr">${acc.ab}</div>
        ${acc.tier <= 2 ? `<div class="tile-score">${acc.tier === 1 ? '—' : ''}</div>` : ''}
      `;
      board.appendChild(t);
    });
  }

  function fireSignalOn(idx, score) {
    const tile = document.getElementById('tile-' + idx);
    if (!tile) return;
    tile.classList.remove('firing');
    void tile.offsetWidth;
    tile.classList.add('firing');
    if (score && tile.dataset.tier === '1') {
      const scoreEl = tile.querySelector('.tile-score');
      if (scoreEl) scoreEl.textContent = score;
    }
    state.signals++;
    document.getElementById('cSignals').textContent = state.signals;
    document.getElementById('cycleSub').textContent = state.signals + ' signals detected';
  }

  function rescoreOne() {
    state.rescored++;
    document.getElementById('cRescored').textContent = state.rescored;
  }

  function promoteToT1() {
    state.promos++;
    document.getElementById('cPromos').textContent = state.promos;
  }

  function makeHero() {
    const tile = document.getElementById('tile-0');
    if (!tile) return;
    tile.classList.add('hero');
    const scoreEl = tile.querySelector('.tile-score');
    if (scoreEl) scoreEl.textContent = '94';
  }

  function showInvestScore(val) {
    document.getElementById('investScoreValue').textContent = val;
  }

  function showSignal(id) {
    document.querySelector(`[data-id="${id}"]`)?.classList.add('show');
  }

  function showBriefSection(id) {
    document.getElementById('bs-' + id)?.classList.add('show');
  }

  function showHandoff(id) {
    document.getElementById('ho-' + id)?.classList.add('show');
  }

  function briefDone() {
    state.briefs++;
    document.getElementById('cBriefs').textContent = state.briefs;
  }

  function setStatus(text, mode) {
    document.getElementById('statusText').textContent = text;
    const dot = document.getElementById('statusPill')?.querySelector('.status-dot');
    if (!dot) return;
    const colors = {
      scan: 'var(--sim-amber)',
      invest: 'var(--sim-amber)',
      brief: 'var(--sim-amber)',
      send: 'var(--sim-amber)',
      done: 'var(--sim-green)',
      good: 'var(--sim-green)',
    };
    dot.style.background = colors[mode] || 'var(--sim-green)';
    const shadows = {
      scan: 'rgba(196, 165, 116, 0.15)',
      invest: 'rgba(196, 165, 116, 0.15)',
      brief: 'rgba(196, 165, 116, 0.15)',
      send: 'rgba(196, 165, 116, 0.15)',
      done: 'rgba(107, 158, 120, 0.15)',
      good: 'rgba(107, 158, 120, 0.15)',
    };
    dot.style.boxShadow = `0 0 0 4px ${shadows[mode] || shadows.good}`;
  }

  function addLog(type, msg) {
    const time = state.simTime.toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
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
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[d.getDay()]}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })} PT`;
  }

  function updateClock() {
    document.getElementById('simClock').textContent = formatSimTime(state.simTime);
  }

  function getScript() {
    return [
      { delay: 0, action: 'status', text: 'Scanning', mode: 'scan' },
      { delay: 100, action: 'log', type: 'scan', msg: 'Daily research cycle initiated · 200 accounts in territory' },
      { delay: 600, action: 'log', type: 'scan', msg: 'Polling sources: SEC · LinkedIn · BuiltWith · 6sense · news · earnings transcripts' },

      { delay: 900, action: 'fireSignal', idx: 10, score: '67', logType: 'signal', logMsg: '◦ Vertex Mfg (VT) · new CIO announced (LinkedIn)' },
      { delay: 100, action: 'rescore' },
      { delay: 500, action: 'fireSignal', idx: 32, score: '71', logType: 'signal', logMsg: '◦ Atlas Energy (AE) · earnings call mention "data sprawl"' },
      { delay: 100, action: 'rescore' },
      { delay: 600, action: 'fireSignal', idx: 4, score: '79', logType: 'signal', logMsg: '◦ Apex Robotics (AX) · job posting · "data platform lead"' },
      { delay: 100, action: 'rescore' },
      { delay: 500, action: 'fireSignal', idx: 14, score: '64', logType: 'signal', logMsg: '◦ Helix Bio (HX) · Series C close · $80M raised' },
      { delay: 100, action: 'rescore' },
      { delay: 600, action: 'fireSignal', idx: 26, score: '58', logType: 'signal', logMsg: '◦ Pinnacle Systems (PS) · press release · cloud migration' },
      { delay: 100, action: 'rescore' },

      { delay: 700, action: 'fireSignal', idx: 0, score: '62', logType: 'signal', logMsg: '◦ Northwind Pharma (NW) · 10-K mention detected · modernization' },
      { delay: 100, action: 'rescore' },

      { delay: 500, action: 'fireSignal', idx: 18, score: '54', logType: 'signal', logMsg: '◦ Continental Logistics (CL) · CFO change' },
      { delay: 100, action: 'rescore' },

      { delay: 600, action: 'fireSignal', idx: 0, score: '78', logType: 'signal', logMsg: '◦ Northwind Pharma (NW) · senior data hires · 2x in 60 days' },
      { delay: 100, action: 'rescore' },

      { delay: 500, action: 'fireSignal', idx: 36, score: '49', logType: 'signal', logMsg: '◦ Crescent Health (CH) · new investor · board change' },
      { delay: 100, action: 'rescore' },

      { delay: 600, action: 'fireSignal', idx: 0, score: '88', logType: 'signal', logMsg: '◦ Northwind Pharma (NW) · technographic shift · Databricks tags' },
      { delay: 100, action: 'rescore' },
      { delay: 100, action: 'promote' },

      { delay: 500, action: 'fireSignal', idx: 0, score: '91', logType: 'signal', logMsg: '◦ Northwind Pharma (NW) · earnings call · scaling pressure' },
      { delay: 100, action: 'rescore' },

      { delay: 500, action: 'fireSignal', idx: 0, score: '94', logType: 'signal', logMsg: '◦ Northwind Pharma (NW) · warm-intro path detected via Meridian customer' },
      { delay: 100, action: 'rescore' },

      { delay: 800, action: 'log', type: 'invest', msg: '★ Trigger pattern matched · 5 strong signals on single account' },
      { delay: 400, action: 'makeHero' },
      { delay: 400, action: 'log', type: 'invest', msg: 'Northwind Pharmaceuticals · highest-priority account today · 12 T1 briefs queued territory-wide' },

      { delay: 800, action: 'status', text: 'Investigating', mode: 'invest' },
      { delay: 100, action: 'reveal', section: 'investSection' },
      { delay: 100, action: 'showInvestScore', val: '94' },

      { delay: 600, action: 'log', type: 'invest', msg: 'Loading signal #1 · SEC 10-K filing (14 days ago)' },
      { delay: 100, action: 'showSignal', id: 's1' },

      { delay: 1200, action: 'log', type: 'invest', msg: 'Loading signal #2 · LinkedIn · executive hiring' },
      { delay: 100, action: 'showSignal', id: 's2' },

      { delay: 1200, action: 'log', type: 'invest', msg: 'Loading signal #3 · BuiltWith · technographic shift' },
      { delay: 100, action: 'showSignal', id: 's3' },

      { delay: 1200, action: 'log', type: 'invest', msg: 'Loading signal #4 · Q3 earnings transcript' },
      { delay: 100, action: 'showSignal', id: 's4' },

      { delay: 1200, action: 'log', type: 'invest', msg: 'Loading signal #5 · CRM × LinkedIn graph · warm-intro path' },
      { delay: 100, action: 'showSignal', id: 's5' },

      { delay: 800, action: 'log', type: 'invest', msg: '✓ 5 signals consolidated · composite score 94 / 100' },

      { delay: 900, action: 'status', text: 'Composing brief', mode: 'brief' },
      { delay: 100, action: 'reveal', section: 'briefSection' },
      { delay: 100, action: 'log', type: 'brief', msg: 'Drafting account brief · 5 sections' },

      { delay: 700, action: 'showBrief', id: 'stats' },
      { delay: 100, action: 'log', type: 'brief', msg: 'Section: account snapshot' },

      { delay: 1100, action: 'showBrief', id: 'trigger' },
      { delay: 100, action: 'log', type: 'brief', msg: 'Section: why now (with historical pattern lookup)' },

      { delay: 1200, action: 'showBrief', id: 'dm' },
      { delay: 100, action: 'log', type: 'brief', msg: 'Section: decision makers (DM × TB × EB resolved)' },

      { delay: 1200, action: 'showBrief', id: 'angle' },
      { delay: 100, action: 'log', type: 'brief', msg: 'Section: recommended angle (referencing Meridian deal context)' },

      { delay: 1100, action: 'showBrief', id: 'play' },
      { delay: 100, action: 'log', type: 'brief', msg: 'Section: next play (AE assignment + sequence selected)' },

      { delay: 600, action: 'briefDone' },
      { delay: 100, action: 'log', type: 'success', msg: '✓ Brief complete · 5 sections · 312 words · 3 DMs · 1 warm path' },

      { delay: 900, action: 'status', text: 'Handing off', mode: 'send' },
      { delay: 100, action: 'reveal', section: 'handoffSection' },

      { delay: 500, action: 'showHandoff', id: 'ae' },
      { delay: 100, action: 'log', type: 'send', msg: '→ Delivered to AE Sarah Chen · CRM tagged T1' },

      { delay: 500, action: 'showHandoff', id: 'agent' },
      { delay: 100, action: 'log', type: 'send', msg: '→ Outbound Sequencing Agent · trigger fired · awaits AE approval' },

      { delay: 500, action: 'showHandoff', id: 'slack' },
      { delay: 100, action: 'log', type: 'send', msg: '→ Slack #pipeline-discovery · summary posted' },

      { delay: 1000, action: 'status', text: 'Cycle complete', mode: 'done' },
      { delay: 100, action: 'log', type: 'success', msg: '✓ Daily cycle complete · 1 priority brief + 11 T1 briefs queued · next cycle: tomorrow 6:00 AM PT' },
    ];
  }

  function runBeat(beat) {
    if (beat.delay > 300) {
      state.simTime = new Date(state.simTime.getTime() + Math.round(beat.delay / 1000 * 4) * 1000);
      updateClock();
    }
    switch (beat.action) {
      case 'log': addLog(beat.type, beat.msg); break;
      case 'fireSignal':
        fireSignalOn(beat.idx, beat.score);
        if (beat.logType) addLog(beat.logType, beat.logMsg);
        break;
      case 'rescore': rescoreOne(); break;
      case 'promote': promoteToT1(); break;
      case 'makeHero': makeHero(); break;
      case 'showInvestScore': showInvestScore(beat.val); break;
      case 'showSignal': showSignal(beat.id); break;
      case 'showBrief': showBriefSection(beat.id); break;
      case 'showHandoff': showHandoff(beat.id); break;
      case 'briefDone': briefDone(); break;
      case 'status': setStatus(beat.text, beat.mode); break;
      case 'reveal': document.getElementById(beat.section)?.classList.add('show'); break;
      default: break;
    }
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

  function setPlayButton(playing) {
    const btn = document.getElementById('playBtn');
    if (!btn) return;
    btn.innerHTML = playing
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
    document.getElementById('cSignals').textContent = '0';
    document.getElementById('cRescored').textContent = '0';
    document.getElementById('cPromos').textContent = '0';
    document.getElementById('cBriefs').textContent = '0';
    document.getElementById('cycleSub').textContent = '0 signals detected';
    document.getElementById('investScoreValue').textContent = '—';

    document.querySelectorAll('.tile').forEach((t) => {
      t.classList.remove('hero', 'firing');
      const s = t.querySelector('.tile-score');
      if (s) s.textContent = t.dataset.tier === '1' ? '—' : '';
    });

    document.querySelectorAll('.reveal').forEach((el) => el.classList.remove('show'));
    document.querySelectorAll('.signal').forEach((el) => el.classList.remove('show'));
    document.querySelectorAll('.brief-section').forEach((el) => el.classList.remove('show'));
    document.querySelectorAll('.handoff').forEach((el) => el.classList.remove('show'));

    updateClock();
    setStatus('Ready', 'good');
  }

  document.getElementById('playBtn')?.addEventListener('click', () => (state.playing ? pause() : play()));
  document.getElementById('resetBtn')?.addEventListener('click', reset);
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

  buildBoard();
  initState();
  script = getScript();
  updateClock();
  setStatus('Ready', 'good');
})();
