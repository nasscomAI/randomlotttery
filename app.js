const state = { entries: [], file: null, drawing: false };
const sound = { enabled: readMusicPreference(), context: null, bus: null, master: null, noise: null, timer: null, beat: 0 };

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
}

// Original 8-bit style loop in C major: 32 sixteenth-note steps (two bars), square lead,
// pulse bass, noise hats. 0 = rest. Written for this app; not a transcription of anything.
const BEAT_MS = 105;
const N = { G3: 196, A3: 220, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, E6: 1318.5, G6: 1567.98,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G2: 98, A2: 110 };
const LOOP = {
  lead: [N.E5, N.G5, N.C6, 0, N.G5, 0, N.E5, 0, N.D5, N.E5, N.F5, 0, N.E5, 0, N.D5, 0,
         N.C5, N.E5, N.G5, 0, N.A5, 0, N.G5, 0, N.F5, N.E5, N.D5, N.E5, N.C5, 0, 0, 0],
  bass: [N.C3, 0, N.C3, 0, N.G2, 0, N.G2, 0, N.F3, 0, N.F3, 0, N.G3, 0, N.G3, 0,
         N.A2, 0, N.A2, 0, N.E3, 0, N.E3, 0, N.F3, 0, N.F3, 0, N.G3, 0, N.G3, 0]
};

function startDrawMusic() {
  stopDrawMusic();
  if (!sound.enabled || !getAudioContext()) return;
  sound.beat = 0;
  const tick = () => {
    const step = sound.beat % LOOP.lead.length;
    if (LOOP.lead[step]) playTone(LOOP.lead[step], 0, .17, .16, 'square');
    if (LOOP.bass[step]) playTone(LOOP.bass[step], 0, .2, .2, 'triangle');
    if (step % 4 === 0) playKick();
    if (step % 2 === 1) playNoise(0, .04, step % 4 === 3 ? .1 : .05);
    sound.beat++;
  };
  tick();
  sound.timer = window.setInterval(tick, BEAT_MS);
}

function stopDrawMusic() {
  if (sound.timer) window.clearInterval(sound.timer);
  sound.timer = null;
}

function playCoin(delay = 0) {
  playTone(N.G5, delay, .08, .18, 'square');
  playTone(N.C6, delay + .07, .08, .18, 'square');
  playTone(N.E6, delay + .14, .45, .18, 'square');
}

function playWinnerFanfare() {
  if (!sound.enabled) return;
  playCoin(0);
  // Short victory riff after the coin: a rising run that lands on a held C major chord.
  const run = [N.C5, N.E5, N.G5, N.C6, N.E6];
  run.forEach((note, index) => playTone(note, .55 + index * .09, .12, .16, 'square'));
  const hold = 1.05;
  [N.C5, N.E5, N.G5, N.C6].forEach((note, voice) => playTone(note, hold, 1.1, voice === 3 ? .18 : .12, voice % 2 ? 'square' : 'triangle'));
  playTone(N.C3, hold, 1.1, .3, 'triangle');
  [0, .55, hold].forEach((d) => playKick(d));
  [.6, .78, .96].forEach((d) => playNoise(d, .04, .07));
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
  startDrawMusic();
  setView('draw');
  $('#drawStage').style.display = 'block';
  $('#winnerStage').classList.remove('show');
  $('#progressBar').style.width = '0%';
  $('#drawStatus').textContent = 'Mixing things up...';
  const winner = state.entries[randomIndex(state.entries.length)];
  const duration = 4200;
  const start = performance.now();
  let nextSwitch = 0;

  function animate(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    if (now >= nextSwitch) {
      const candidate = state.entries[randomIndex(state.entries.length)];
      $('#candidateName').textContent = candidate.name;
      $('#candidateNumber').textContent = candidate.number;
      nextSwitch = now + 70 + progress * 260;
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
    stopDrawMusic();
    $('#drawStage').style.display = 'none';
    $('#winnerName').textContent = winner.name;
    $('#winnerDetail').textContent = winner.detail;
    $('#winnerNumber').textContent = winner.number;
    createConfetti();
    playWinnerFanfare();
    $('#winnerStage').classList.add('show');
    state.drawing = false;
  }, 450);
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
  else if (state.drawing) startDrawMusic();
  else playCoin(0);
  updateSoundButton();
});
updateSoundButton();
