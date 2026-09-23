const state = { entries: [], file: null, drawing: false, drawStart: 0 };
const sound = { enabled: readMusicPreference(), context: null, bus: null, master: null, noise: null, scheduled: [], timer: null, beat: 0 };

function readMusicPreference() {
  try { return localStorage.getItem('luckyDrawMusic') !== 'off'; } catch { return true; }
}

const $ = (selector) => document.querySelector(selector);
const panels = { upload: $('#uploadPanel'), review: $('#reviewPanel'), draw: $('#drawPanel') };

const MASTER_VOLUME = .6;

function getAudioContext() {
  if (!sound.context) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    sound.context = new AudioContext();
    // One master chain: a limiter so stacked notes never clip, then a single volume control.
    const limiter = sound.context.createDynamicsCompressor();
    limiter.threshold.value = -12; limiter.ratio.value = 6; limiter.attack.value = .003; limiter.release.value = .12;
    sound.master = sound.context.createGain();
    sound.master.gain.value = MASTER_VOLUME;
    limiter.connect(sound.master).connect(sound.context.destination);
    sound.bus = limiter;
  }
  if (sound.context.state === 'suspended') sound.context.resume();
  return sound.context;
}

function playTone(frequency, delay = 0, duration = .25, volume = .25, type = 'sine') {
  if (!sound.enabled) return;
  const context = getAudioContext();
  if (!context) return;
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + .015);
  gain.gain.setValueAtTime(volume, start + Math.max(.015, duration * .35));
  gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(gain).connect(sound.bus);
  oscillator.start(start);
  oscillator.stop(start + duration + .03);
  sound.scheduled.push({ node: oscillator, gain });
}

function playKick(delay = 0) {
  if (!sound.enabled) return;
  const context = getAudioContext();
  if (!context) return;
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.setValueAtTime(150, start);
  oscillator.frequency.exponentialRampToValueAtTime(45, start + .12);
  gain.gain.setValueAtTime(.7, start);
  gain.gain.exponentialRampToValueAtTime(.001, start + .18);
  oscillator.connect(gain).connect(sound.bus);
  oscillator.start(start);
  oscillator.stop(start + .2);
  sound.scheduled.push({ node: oscillator, gain });
}

function playNoise(delay = 0, duration = .05, volume = .12) {
  if (!sound.enabled) return;
  const context = getAudioContext();
  if (!context) return;
  if (!sound.noise) {
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    sound.noise = buffer;
  }
  const start = context.currentTime + delay;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = sound.noise;
  filter.type = 'highpass'; filter.frequency.value = 6000;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(.001, start + duration);
  source.connect(filter).connect(gain).connect(sound.bus);
  source.start(start);
  source.stop(start + duration + .02);
  sound.scheduled.push({ node: source, gain });
}

// Note frequencies (Hz).
const N = { C2: 65.41, G2: 98, B2: 123.47, C3: 130.81, E3: 164.81, F3: 174.61, FS3: 185, G3: 196, B3: 246.94, C4: 261.63,
  CS4: 277.18, D4: 293.66, DS4: 311.13, E4: 329.63, F4: 349.23, FS4: 369.99, G4: 392, GS4: 415.3, A4: 440, B4: 493.88,
  C5: 523.25, CS5: 554.37, D5: 587.33, DS5: 622.25, E5: 659.25, FS5: 739.99, G5: 783.99, C6: 1046.5, E6: 1318.5 };

// Draw music: "In the Hall of the Mountain King" (Grieg, 1875, public domain), chiptune arrangement.
// 64 eighth-note steps that accelerate from 170ms to 80ms, so the whole theme lasts exactly DRAW_MS.
// Each entry is [frequency, length in steps]. The draw animation is driven by the same timeline.
const MOUNTAIN_KING = [
  [N.B3, 1], [N.CS4, 1], [N.D4, 1], [N.E4, 1], [N.FS4, 1], [N.D4, 1], [N.FS4, 2],
  [N.F4, 1], [N.CS4, 1], [N.F4, 2], [N.E4, 1], [N.C4, 1], [N.E4, 2],
  [N.B3, 1], [N.CS4, 1], [N.D4, 1], [N.E4, 1], [N.FS4, 1], [N.D4, 1], [N.FS4, 1], [N.B4, 1],
  [N.A4, 1], [N.FS4, 1], [N.D4, 1], [N.FS4, 1], [N.A4, 4],
  [N.FS4, 1], [N.GS4, 1], [N.A4, 1], [N.B4, 1], [N.CS5, 1], [N.A4, 1], [N.CS5, 2],
  [N.C5, 1], [N.GS4, 1], [N.C5, 2], [N.B4, 1], [N.G4, 1], [N.B4, 2],
  [N.FS4, 1], [N.GS4, 1], [N.A4, 1], [N.B4, 1], [N.CS5, 1], [N.A4, 1], [N.CS5, 1], [N.FS5, 1],
  [N.E5, 1], [N.CS5, 1], [N.A4, 1], [N.CS5, 1], [N.E5, 4]
];
const STEP_COUNT = MOUNTAIN_KING.reduce((sum, [, length]) => sum + length, 0); // 64
const STEP_MS = Array.from({ length: STEP_COUNT }, (_, i) => 170 - 90 * (i / (STEP_COUNT - 1)));
const STEP_START = STEP_MS.reduce((starts, ms, i) => { starts.push(i ? starts[i - 1] + STEP_MS[i - 1] : 0); return starts; }, []);
const DRAW_MS = STEP_START[STEP_COUNT - 1] + STEP_MS[STEP_COUNT - 1]; // 8000

function stepAt(elapsedMs) {
  let step = 0;
  while (step < STEP_COUNT - 1 && STEP_START[step + 1] <= elapsedMs) step++;
  return step;
}

// Schedules the whole theme up front on the audio clock, skipping anything before offsetMs
// so the music can be switched on part-way through a draw and stay in sync with the animation.
function startDrawMusic(offsetMs = 0) {
  stopDrawMusic();
  if (!sound.enabled || !getAudioContext()) return;
  let step = 0;
  MOUNTAIN_KING.forEach(([note, length]) => {
    const startMs = STEP_START[step] - offsetMs;
    const lengthMs = STEP_MS.slice(step, step + length).reduce((sum, ms) => sum + ms, 0);
    const progress = step / STEP_COUNT;
    if (startMs >= 0) {
      const delay = startMs / 1000;
      const seconds = lengthMs / 1000;
      playTone(note, delay, seconds * .9, .16, 'square');
      playTone(note / 4, delay, seconds * .8, .22, 'triangle');
      if (progress > .5) playTone(note / 2, delay, seconds * .6, .08, 'sawtooth');
      if (step % 2 === 0) playKick(delay);
      if (progress > .5 && length === 1) playNoise(delay + seconds / 2, .04, .06);
    }
    step += length;
  });
}

function stopDrawMusic() {
  if (sound.timer) window.clearInterval(sound.timer);
  sound.timer = null;
  const now = sound.context ? sound.context.currentTime : 0;
  sound.scheduled.forEach(({ node, gain }) => {
    try { gain.gain.cancelScheduledValues(now); gain.gain.setValueAtTime(.0001, now); node.stop(now + .01); } catch {}
  });
  sound.scheduled = [];
}

// Winner music: the opening fanfare of "Also sprach Zarathustra" (R. Strauss, 1896, public domain).
function playWinnerFanfare() {
  if (!sound.enabled) return;
  const brass = (note, delay, seconds, volume) => {
    playTone(note, delay, seconds, volume, 'square');
    playTone(note, delay, seconds, volume * .8, 'triangle');
    playTone(note / 2, delay, seconds, volume * .5, 'triangle');
  };
  brass(N.C4, 0, .75, .16);
  brass(N.G4, .7, .75, .17);
  brass(N.C5, 1.4, .95, .18);
  brass(N.E5, 2.3, .28, .18);
  brass(N.DS5, 2.58, 1.5, .2);
  playTone(N.C3, 2.58, 1.5, .25, 'triangle');
  playTone(N.G3, 2.58, 1.5, .12, 'triangle');
  playTone(N.C2, 0, 2.5, .2, 'triangle');
  for (let i = 0; i < 12; i++) playKick(2.58 + i * .11);
  playKick(3.9);
}

function playCoin(delay = 0) {
  playTone(N.G5, delay, .08, .18, 'square');
  playTone(N.C6, delay + .07, .08, .18, 'square');
  playTone(N.E6, delay + .14, .45, .18, 'square');
}

function updateSoundButton() {
  const button = $('#soundToggle');
  button.classList.toggle('muted', !sound.enabled);
  button.setAttribute('aria-pressed', String(sound.enabled));
  button.setAttribute('aria-label', sound.enabled ? 'Turn off draw music' : 'Turn on draw music');
  button.querySelector('.sound-icon').textContent = sound.enabled ? '♪' : '×';
  button.querySelector('b').textContent = sound.enabled ? 'Music on' : 'Music off';
}

function setView(view) {
  Object.values(panels).forEach((panel) => panel.classList.remove('active'));
  panels[view].classList.add('active');
  const current = { upload: 1, review: 2, draw: 3 }[view];
  document.querySelectorAll('.step').forEach((step, index) => {
    step.classList.toggle('active', index + 1 === current);
    step.classList.toggle('complete', index + 1 < current);
    if (index + 1 < current) step.querySelector('span').textContent = '✓';
    else step.querySelector('span').textContent = index + 1;
  });
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell.trim()); cell = ''; }
    else if (char === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else if (char !== '\r') cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows.filter((r) => r.some(Boolean));
}

function normaliseEntries(rows) {
  if (rows.length < 2) throw new Error('The file needs a header and at least one participant.');
  const headers = rows[0].map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const nameIndex = headers.findIndex((h) => ['name', 'fullname', 'participant', 'participantname'].includes(h));
  const numberIndex = headers.findIndex((h) => ['number', 'randomnumber', 'luckynumber', 'id', 'ticketnumber', 'ticket'].includes(h));
  const detailIndex = headers.findIndex((h) => ['company', 'companyname', 'organisation', 'organization', 'details', 'department', 'team'].includes(h));
  if (nameIndex < 0) throw new Error('Please include a column named “Name”.');

  const dataRows = rows.slice(1).filter((row) => row.some((cell) => String(cell ?? '').trim()));
  const numberWidth = Math.max(2, String(dataRows.length).length);
  const entries = dataRows.map((row, index) => ({
    name: String(row[nameIndex] ?? '').trim(),
    number: numberIndex >= 0 && String(row[numberIndex] ?? '').trim()
      ? String(row[numberIndex]).trim()
      : String(index + 1).padStart(numberWidth, '0'),
    detail: detailIndex >= 0 ? String(row[detailIndex] ?? '').trim() : '',
    row: index + 2
  }));
  const invalid = entries.find((entry) => !entry.name);
  if (invalid) throw new Error(`Row ${invalid.row} is missing a participant name.`);
  if (!entries.length) throw new Error('No participants were found in this file.');
  return entries;
}

function showError(message) {
  $('#errorMessage').textContent = message;
  $('#errorMessage').classList.add('show');
}

async function handleFile(file) {
  $('#errorMessage').classList.remove('show');
  const extension = file?.name.toLowerCase().match(/\.(csv|xlsx|xls)$/)?.[1];
  if (!file || !extension) return showError('Choose a valid CSV, XLSX, or XLS file.');
  if (file.size > 5 * 1024 * 1024) return showError('That file is over the 5 MB limit.');
  try {
    let rows;
    if (extension === 'csv') {
      rows = parseCSV(await file.text());
    } else {
      if (!window.XLSX) throw new Error('The Excel reader could not load. Check your internet connection and try again.');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      if (!workbook.SheetNames.length) throw new Error('No worksheets were found in this Excel file.');
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '', raw: false });
    }
    const entries = normaliseEntries(rows);
    state.entries = entries;
    state.file = file;
    renderReview();
    setView('review');
  } catch (error) { showError(error.message); }
}

function renderReview() {
  const extension = state.file.name.split('.').pop().toUpperCase();
  $('.file-icon').textContent = extension;
  $('#fileName').textContent = state.file.name;
  $('#fileMeta').textContent = `${state.entries.length} participant${state.entries.length === 1 ? '' : 's'} · ${(state.file.size / 1024).toFixed(1)} KB`;
  $('#reviewSummary').textContent = `${state.entries.length} participant${state.entries.length === 1 ? '' : 's'} entered and ready to go.`;
  $('#entriesBody').innerHTML = state.entries.map((entry, index) =>
    `<tr><td>${index + 1}</td><td>${escapeHTML(entry.name)}</td><td>${escapeHTML(entry.detail || '—')}</td><td>${escapeHTML(entry.number)}</td></tr>`
  ).join('');
}

function escapeHTML(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function randomIndex(max) {
  if (window.crypto?.getRandomValues) {
    const limit = Math.floor(0x100000000 / max) * max;
    const values = new Uint32Array(1);
    do window.crypto.getRandomValues(values); while (values[0] >= limit);
    return values[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function runDraw() {
  if (state.drawing) return;
  state.drawing = true;
  state.drawStart = performance.now();
  startDrawMusic();
  setView('draw');
  $('#drawStage').style.display = 'block';
  $('#winnerStage').classList.remove('show');
  $('#progressBar').style.width = '0%';
  $('#drawStatus').textContent = 'Mixing things up...';
  const winner = state.entries[randomIndex(state.entries.length)];
  let lastStep = -1;

  function animate(now) {
    const elapsed = now - state.drawStart;
    const progress = Math.min(elapsed / DRAW_MS, 1);
    const step = stepAt(elapsed);
    if (step !== lastStep) {
      lastStep = step;
      const candidate = state.entries[randomIndex(state.entries.length)];
      $('#candidateName').textContent = candidate.name;
      $('#candidateNumber').textContent = candidate.number;
    }
    $('#progressBar').style.width = `${Math.round(progress * 100)}%`;
    if (progress > .72) $('#drawStatus').textContent = 'Almost there...';
    if (progress < 1) requestAnimationFrame(animate);
    else revealWinner(winner);
  }
  requestAnimationFrame(animate);
}

function revealWinner(winner) {
  stopDrawMusic();
  $('#candidateName').textContent = winner.name;
  $('#candidateNumber').textContent = winner.number;
  setTimeout(() => {
    $('#drawStage').style.display = 'none';
    $('#winnerName').textContent = winner.name;
    $('#winnerDetail').textContent = winner.detail;
    $('#winnerNumber').textContent = winner.number;
    createConfetti();
    playWinnerFanfare();
    $('#winnerStage').classList.add('show');
    state.drawing = false;
  }, 350);
}

function createConfetti() {
  const box = $('#confetti');
  box.innerHTML = '';
  const colors = ['#c33531', '#ffffff', '#581212', '#e8e8e8', '#c33531'];
  for (let i = 0; i < 45; i++) {
    const bit = document.createElement('i');
    const angle = Math.random() * Math.PI * 2;
    const distance = 100 + Math.random() * 220;
    bit.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
    bit.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
    bit.style.setProperty('--r', `${Math.random() * 800 - 400}deg`);
    bit.style.setProperty('--color', colors[i % colors.length]);
    bit.style.animationDelay = `${Math.random() * .25}s`;
    box.appendChild(bit);
  }
}

$('#fileInput').addEventListener('change', (event) => handleFile(event.target.files[0]));
$('#dropZone').addEventListener('dragover', (event) => { event.preventDefault(); event.currentTarget.classList.add('dragging'); });
$('#dropZone').addEventListener('dragleave', (event) => event.currentTarget.classList.remove('dragging'));
$('#dropZone').addEventListener('drop', (event) => {
  event.preventDefault(); event.currentTarget.classList.remove('dragging'); handleFile(event.dataTransfer.files[0]);
});
$('#sampleBtn').addEventListener('click', () => {
  const csv = 'Name,Number\nAarav Sharma,1042\nMeera Patel,2087\nKabir Singh,3156\nAnanya Rao,4291\nVivaan Gupta,5378\n';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = 'lucky-draw-sample.csv'; link.click(); URL.revokeObjectURL(link.href);
});
$('#changeFileBtn').addEventListener('click', () => { $('#fileInput').value = ''; setView('upload'); });
$('#startBtn').addEventListener('click', runDraw);
$('#drawAgainBtn').addEventListener('click', runDraw);
$('#newDrawBtn').addEventListener('click', () => { state.entries = []; state.file = null; $('#fileInput').value = ''; setView('upload'); });
$('#soundToggle').addEventListener('click', () => {
  sound.enabled = !sound.enabled;
  try { localStorage.setItem('luckyDrawMusic', sound.enabled ? 'on' : 'off'); } catch {}
  if (!sound.enabled) stopDrawMusic();
  else if (state.drawing) startDrawMusic(performance.now() - state.drawStart);
  else playCoin(0);
  updateSoundButton();
});
updateSoundButton();
