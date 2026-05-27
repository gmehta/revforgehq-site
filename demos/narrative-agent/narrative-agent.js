// Performance Narrative Agent — deterministic client-side simulation

const INGEST_DATA = {
  budget: { line1: '1,247 reallocations', line2: '$284K shifted · 6 alerts' },
  creative: { line1: '84 refresh cycles', line2: '12 promoted to evergreen' },
  audience: { line1: '4,128 syncs', line2: '847 exclusions · LAL ×4' },
  copy: { line1: '6 experiments live', line2: '47 winning variants' },
  guardian: { line1: '3 incidents handled', line2: 'MTTR 11min · 0 false-pos' },
};

let state;
let speed = 1;
let script = [];
let scriptIdx = 0;

const STATUS_GLOW = {
  ingest: 'rgba(107, 158, 120, 0.15)',
  synth: 'rgba(107, 158, 120, 0.15)',
  compose: 'rgba(107, 158, 120, 0.15)',
  send: 'rgba(107, 158, 120, 0.15)',
  done: 'rgba(107, 158, 120, 0.15)',
  good: 'rgba(107, 158, 120, 0.15)',
};

function initState() {
  state = {
    playing: false,
    simTime: new Date(2026, 4, 29, 15, 0, 0),
    logs: [],
    ingested: 0,
  };
}

function ingestFrom(agent) {
  const lane = document.getElementById(`lane-${agent}`);
  const status = lane.querySelector('.lane-status');
  const count = document.getElementById(`count-${agent}`);
  lane.classList.add('receiving');
  status.textContent = 'receiving…';
  setTimeout(() => {
    lane.classList.remove('receiving');
    lane.classList.add('received');
    status.textContent = '✓ received';
    const d = INGEST_DATA[agent];
    count.innerHTML = `<div>${d.line1}</div><div class="lane-sub">${d.line2}</div>`;
    state.ingested++;
    document.getElementById('cycleSub').textContent = `${state.ingested} / 5 agents ingested`;
  }, 600);
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
  document.getElementById(`bs-${id}`).classList.add('show');
}

function showRec(agent) {
  document.getElementById(`rec-${agent}`).classList.add('show');
}

function distribute(channel) {
  document.getElementById(`dist-${channel}`).classList.add('sent');
}

function setStatus(text, mode) {
  document.getElementById('statusText').textContent = text;
  const dot = document.getElementById('statusPill').querySelector('.status-dot');
  const colors = {
    ingest: 'var(--sim-accent)',
    synth: 'var(--sim-accent)',
    compose: 'var(--sim-accent)',
    send: 'var(--sim-accent)',
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

function formatSimTime(d) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })} PT`;
}

function updateClock() {
  document.getElementById('simClockTime').textContent = formatSimTime(state.simTime);
}

function getScript() {
  return [
    { delay: 0, action: 'status', text: 'Ingesting', mode: 'ingest' },
    { delay: 100, action: 'log', type: 'ingest', msg: 'Weekly briefing cycle triggered · 7-day window (May 22–29)' },

    { delay: 800, action: 'log', type: 'ingest', msg: '← Pulling from Portfolio Agent' },
    { delay: 100, action: 'ingestFrom', agent: 'budget' },

    { delay: 900, action: 'log', type: 'ingest', msg: '← Pulling from Creative Agent' },
    { delay: 100, action: 'ingestFrom', agent: 'creative' },

    { delay: 900, action: 'log', type: 'ingest', msg: '← Pulling from Audience Expansion Agent' },
    { delay: 100, action: 'ingestFrom', agent: 'audience' },

    { delay: 900, action: 'log', type: 'ingest', msg: '← Pulling from Copy Matrix Agent' },
    { delay: 100, action: 'ingestFrom', agent: 'copy' },

    { delay: 900, action: 'log', type: 'ingest', msg: '← Pulling from Guardian Agent' },
    { delay: 100, action: 'ingestFrom', agent: 'guardian' },

    { delay: 1000, action: 'status', text: 'Synthesizing', mode: 'synth' },
    { delay: 100, action: 'showSynth', text: 'Cross-referencing 5 data sources · ranking narratives by business impact' },
    { delay: 100, action: 'log', type: 'synth', msg: 'Cross-correlation pass · 142 metrics × 28 segments × 7 days' },

    { delay: 1400, action: 'log', type: 'synth', msg: 'Pattern recognition · 5 narrative threads surfaced, ranked' },
    { delay: 1000, action: 'log', type: 'synth', msg: 'Story #1 (lead): Self-Employed cohort × Documentation pain · highest impact' },
    { delay: 800, action: 'doneSynth', text: '✓ Synthesis complete · 5 stories ranked · drafting briefing' },

    { delay: 800, action: 'status', text: 'Composing', mode: 'compose' },
    { delay: 100, action: 'reveal', section: 'briefingSection' },

    { delay: 700, action: 'showBrief', id: 'tldr' },
    { delay: 100, action: 'log', type: 'compose', msg: 'Drafting · TL;DR' },

    { delay: 1400, action: 'showBrief', id: 'story' },
    { delay: 100, action: 'log', type: 'compose', msg: 'Drafting · the story of the week' },

    { delay: 1500, action: 'showBrief', id: 'channels' },
    { delay: 100, action: 'log', type: 'compose', msg: 'Drafting · channel performance' },

    { delay: 1400, action: 'showBrief', id: 'audience' },
    { delay: 100, action: 'log', type: 'compose', msg: 'Drafting · audience movement' },

    { delay: 1300, action: 'showBrief', id: 'risks' },
    { delay: 100, action: 'log', type: 'compose', msg: 'Drafting · risks & incidents (Guardian feed)' },

    { delay: 1400, action: 'showBrief', id: 'rec' },
    { delay: 100, action: 'log', type: 'compose', msg: 'Drafting · recommended next-week moves' },

    { delay: 800, action: 'log', type: 'success', msg: '✓ Briefing complete · 6 sections · 412 words · 4 recommendations' },

    { delay: 1000, action: 'status', text: 'Closing loop', mode: 'send' },
    { delay: 100, action: 'log', type: 'send', msg: '→ Translating recommendations into prescriptions for downstream agents' },
    { delay: 200, action: 'reveal', section: 'recsSection' },

    { delay: 700, action: 'showRec', agent: 'budget' },
    { delay: 100, action: 'log', type: 'send', msg: '→ Portfolio Agent · reallocation prescription written' },

    { delay: 600, action: 'showRec', agent: 'copy' },
    { delay: 100, action: 'log', type: 'send', msg: '→ Copy Matrix Agent · Round 3 brief written' },

    { delay: 600, action: 'showRec', agent: 'creative' },
    { delay: 100, action: 'log', type: 'send', msg: '→ Creative Agent · pre-emptive refresh schedule written' },

    { delay: 600, action: 'showRec', agent: 'audience' },
    { delay: 100, action: 'log', type: 'send', msg: '→ Audience Expansion Agent · new seed audience spec written' },

    { delay: 700, action: 'log', type: 'success', msg: '✓ 4 prescriptions delivered · agents will pick up at next cycle' },

    { delay: 1000, action: 'log', type: 'send', msg: '↗ Distributing briefing to human destinations' },
    { delay: 100, action: 'reveal', section: 'distSection' },

    { delay: 500, action: 'distribute', channel: 'email' },
    { delay: 100, action: 'log', type: 'send', msg: '✓ Email sent · CMO + 8 leadership' },

    { delay: 400, action: 'distribute', channel: 'slack' },
    { delay: 100, action: 'log', type: 'send', msg: '✓ Slack posted · #marketing-leadership' },

    { delay: 400, action: 'distribute', channel: 'dash' },
    { delay: 100, action: 'log', type: 'send', msg: '✓ Dashboard updated · home tile · "This week" section' },

    { delay: 400, action: 'distribute', channel: 'archive' },
    { delay: 100, action: 'log', type: 'send', msg: '✓ Archived · briefing #w22 added to repository (searchable)' },

    { delay: 1000, action: 'status', text: 'Cycle complete', mode: 'done' },
    { delay: 100, action: 'log', type: 'success', msg: '✓ Weekly cycle complete · next run: Monday 9:00 AM PT' },
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
  if (beat.delay > 300) {
    state.simTime = new Date(state.simTime.getTime() + Math.round(beat.delay / 1000) * 2 * 1000);
    updateClock();
  }
  switch (beat.action) {
    case 'log':
      addLog(beat.type, beat.msg);
      break;
    case 'ingestFrom':
      ingestFrom(beat.agent);
      break;
    case 'showSynth':
      showSynth(beat.text);
      break;
    case 'doneSynth':
      doneSynth(beat.text);
      break;
    case 'showBrief':
      showBriefSection(beat.id);
      break;
    case 'showRec':
      showRec(beat.agent);
      break;
    case 'distribute':
      distribute(beat.channel);
      break;
    case 'status':
      setStatus(beat.text, beat.mode);
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
  document.getElementById('cycleSub').textContent = '0 / 5 agents ingested';

  ['budget', 'creative', 'audience', 'copy', 'guardian'].forEach((a) => {
    const lane = document.getElementById(`lane-${a}`);
    lane.classList.remove('received', 'receiving');
    lane.querySelector('.lane-status').textContent = 'queued';
    document.getElementById(`count-${a}`).textContent = '—';
  });

  const synth = document.getElementById('synth');
  synth.classList.remove('show', 'done');
  document.getElementById('synthText').textContent =
    'Cross-referencing 5 data sources · ranking narratives by business impact';

  document.querySelectorAll('.reveal').forEach((el) => el.classList.remove('show'));
  document.querySelectorAll('.brief-section').forEach((el) => el.classList.remove('show'));
  document.querySelectorAll('.rec').forEach((el) => el.classList.remove('show'));
  document.querySelectorAll('.dist').forEach((el) => el.classList.remove('sent'));

  updateClock();
  setStatus('Ready', 'good');
}

function initNarrativeAgent() {
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
  updateClock();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNarrativeAgent);
} else {
  initNarrativeAgent();
}
