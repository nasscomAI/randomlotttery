const state = { entries: [], file: null, drawing: false };

const $ = (selector) => document.querySelector(selector);
const panels = { upload: $('#uploadPanel'), review: $('#reviewPanel'), draw: $('#drawPanel') };

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
  $('#candidateName').textContent = winner.name;
  $('#candidateNumber').textContent = winner.number;
  setTimeout(() => {
    $('#drawStage').style.display = 'none';
    $('#winnerName').textContent = winner.name;
    $('#winnerDetail').textContent = winner.detail;
    $('#winnerNumber').textContent = winner.number;
    createConfetti();
    $('#winnerStage').classList.add('show');
    state.drawing = false;
  }, 450);
}

function createConfetti() {
  const box = $('#confetti');
  box.innerHTML = '';
  const colors = ['#a88cff', '#71e6bb', '#ffd36e', '#ff7897', '#74b8ff'];
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
