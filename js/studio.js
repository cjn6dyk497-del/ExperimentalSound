// Private producer workspace: projects, lyrics+chords, notes, metronome.
// All data lives only in THIS browser (IndexedDB) — nothing is uploaded.
import { getProjects, saveProject, deleteProject, newProject } from './studio-store.js';
import { Metronome } from './metronome.js';

const PIN_KEY = 'studio.pinHash';
const PREFS_KEY = 'studio.prefs';

const state = {
  projects: [],
  currentId: null,
  showPreview: false,
  filter: ''
};

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ *
 * Lock screen (optional PIN — casual, local-only privacy)
 * ------------------------------------------------------------------ */
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const cryptoOK = () => Boolean(window.crypto && crypto.subtle);

async function gate() {
  const hash = localStorage.getItem(PIN_KEY);
  if (!hash || !cryptoOK()) { unlock(); return; }
  $('lock').hidden = false;
  $('workspace').hidden = true;
  const form = $('lock-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = (await sha256($('lock-pin').value)) === hash;
    if (ok) { $('lock').hidden = true; unlock(); }
    else { $('lock-error').textContent = 'PIN incorreto.'; $('lock-pin').value = ''; }
  });
  $('lock-pin').focus();
}

function unlock() {
  $('lock').hidden = true;
  $('workspace').hidden = false;
  init();
}

async function managePin() {
  const has = Boolean(localStorage.getItem(PIN_KEY));
  if (!cryptoOK()) {
    alert('Proteção por PIN indisponível neste contexto (requer HTTPS).');
    return;
  }
  if (has) {
    if (confirm('Remover o PIN? A área ficará acessível sem senha neste navegador.')) {
      const cur = prompt('Confirme o PIN atual para remover:');
      if (cur == null) return;
      if ((await sha256(cur)) === localStorage.getItem(PIN_KEY)) {
        localStorage.removeItem(PIN_KEY);
        alert('PIN removido.');
      } else alert('PIN incorreto.');
    }
    return;
  }
  const pin = prompt('Defina um PIN para esta área (lembre-se dele — não há recuperação).\nObs.: é uma proteção casual; os dados ficam neste navegador sem criptografia.');
  if (!pin) return;
  const confirmPin = prompt('Repita o PIN:');
  if (pin !== confirmPin) { alert('Os PINs não conferem.'); return; }
  localStorage.setItem(PIN_KEY, await sha256(pin));
  alert('PIN definido. Será pedido ao abrir o Estúdio.');
}

/* ------------------------------------------------------------------ *
 * Projects list + selection
 * ------------------------------------------------------------------ */
const STATUS_LABEL = { ideia: 'Ideia', progresso: 'Em progresso', mixagem: 'Mixagem', finalizado: 'Finalizado' };

function current() { return state.projects.find((p) => p.id === state.currentId) || null; }

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderList() {
  const ul = $('project-list');
  const q = state.filter.trim().toLowerCase();
  const items = [...state.projects]
    .filter((p) => !q || `${p.title} ${p.genre} ${p.notes} ${p.lyrics}`.toLowerCase().includes(q))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  $('projects-empty').hidden = state.projects.length > 0;
  ul.innerHTML = items.map((p) => `
    <li>
      <button class="pitem ${p.id === state.currentId ? 'active' : ''}" data-id="${p.id}">
        <span class="pitem-title">${esc(p.title || 'Sem título')}</span>
        <span class="pitem-foot">
          <span class="st st-${p.status}">${STATUS_LABEL[p.status] || p.status}</span>
          <span class="pitem-date">${fmtDate(p.updatedAt)}</span>
        </span>
      </button>
    </li>`).join('');

  ul.querySelectorAll('.pitem').forEach((el) => {
    el.addEventListener('click', () => select(el.dataset.id));
  });
}

function select(id) {
  state.currentId = id;
  renderList();
  renderEditor();
}

function renderEditor() {
  const p = current();
  $('editor').hidden = !p;
  $('editor-empty').hidden = Boolean(p);
  if (!p) return;

  $('p-title').value = p.title || '';
  $('p-status').value = p.status || 'ideia';
  $('p-bpm').value = p.bpm ?? '';
  $('p-key').value = p.key || '';
  $('p-genre').value = p.genre || '';
  $('p-lyrics').value = p.lyrics || '';
  $('p-notes').value = p.notes || '';
  $('p-dates').textContent = `criado ${fmtDate(p.createdAt)} · editado ${fmtDate(p.updatedAt)}`;
  setSaveState('saved');
  if (state.showPreview) renderPreview();
}

/* ------------------------------------------------------------------ *
 * Editing + autosave
 * ------------------------------------------------------------------ */
let saveTimer = null;
function setSaveState(kind) {
  const el = $('save-state');
  if (kind === 'saving') { el.textContent = 'salvando…'; el.classList.remove('saved'); }
  else if (kind === 'saved') { el.textContent = 'salvo ✓'; el.classList.add('saved'); }
}

function touch() {
  const p = current();
  if (!p) return;
  p.title = $('p-title').value;
  p.status = $('p-status').value;
  p.bpm = Number($('p-bpm').value) || null;
  p.key = $('p-key').value;
  p.genre = $('p-genre').value;
  p.lyrics = $('p-lyrics').value;
  p.notes = $('p-notes').value;
  p.updatedAt = new Date().toISOString();
  setSaveState('saving');
  if (state.showPreview) renderPreview();

  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await saveProject({ ...p });
    setSaveState('saved');
    renderList();
  }, 400);
}

async function createProject() {
  const p = newProject();
  state.projects.push(p);
  await saveProject(p);
  select(p.id);
  $('p-title').focus();
  $('p-title').select();
}

async function removeCurrent() {
  const p = current();
  if (!p) return;
  if (!confirm(`Excluir o projeto "${p.title || 'sem título'}"? Esta ação não pode ser desfeita.`)) return;
  await deleteProject(p.id);
  state.projects = state.projects.filter((x) => x.id !== p.id);
  state.currentId = null;
  renderList();
  renderEditor();
}

/* ------------------------------------------------------------------ *
 * Lyrics + chords preview (ChordPro-style inline [chords])
 * ------------------------------------------------------------------ */
function parseChordLine(line) {
  const re = /\[([^\]]+)\]/g;
  const matches = [];
  let m;
  while ((m = re.exec(line)) !== null) matches.push({ chord: m[1], start: m.index, end: m.index + m[0].length });
  if (!matches.length) return [{ chord: '', text: line }];

  const segs = [];
  if (matches[0].start > 0) segs.push({ chord: '', text: line.slice(0, matches[0].start) });
  matches.forEach((cur, i) => {
    const end = i + 1 < matches.length ? matches[i + 1].start : line.length;
    segs.push({ chord: cur.chord, text: line.slice(cur.end, end) });
  });
  return segs;
}

function chordLineHTML(line) {
  if (line.trim() === '') return '<div class="cl-empty">&nbsp;</div>';
  const cols = parseChordLine(line).map((s) => {
    const chord = `<span class="cl-chord">${esc(s.chord)}</span>`;
    const text = `<span class="cl-text">${s.text ? esc(s.text) : '&nbsp;'}</span>`;
    return `<span class="cl-seg">${chord}${text}</span>`;
  }).join('');
  return `<div class="cl-line">${cols}</div>`;
}

function renderPreview() {
  const text = $('p-lyrics').value;
  $('lyrics-preview').innerHTML = text.split('\n').map(chordLineHTML).join('');
}

function togglePreview() {
  state.showPreview = !state.showPreview;
  $('lyrics-preview').hidden = !state.showPreview;
  $('p-lyrics').hidden = state.showPreview;
  $('toggle-preview').textContent = state.showPreview ? 'Editar' : 'Pré-visualizar';
  if (state.showPreview) renderPreview();
}

/* ------------------------------------------------------------------ *
 * Tabs
 * ------------------------------------------------------------------ */
function wireTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      const name = tab.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.hidden = panel.dataset.panel !== name;
      });
    });
  });
}

/* ------------------------------------------------------------------ *
 * Backup: export / import (data safety, since storage is local)
 * ------------------------------------------------------------------ */
function exportBackup() {
  const data = { app: 'experimentasound-studio', exportedAt: new Date().toISOString(), projects: state.projects };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `estudio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.projects;
    if (!Array.isArray(incoming)) throw new Error('formato inválido');
    let added = 0;
    for (const raw of incoming) {
      if (!raw || !raw.title) continue;
      const p = newProject(raw); // ensures id/timestamps exist; keeps provided fields
      if (!raw.id) p.id = newProject().id;
      else p.id = raw.id;
      await saveProject(p);
      added++;
    }
    state.projects = await getProjects();
    renderList();
    alert(`${added} projeto(s) importado(s).`);
  } catch (err) {
    alert('Não foi possível importar este arquivo.');
  }
}

/* ------------------------------------------------------------------ *
 * Metronome
 * ------------------------------------------------------------------ */
const metro = new Metronome();
const prefs = loadPrefs();

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (_) { return {}; }
}
function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ bpm: metro.bpm, beats: metro.beatsPerMeasure, accent: metro.accent }));
}

function buildBeatDots() {
  const wrap = $('beat-dots');
  wrap.innerHTML = '';
  for (let i = 0; i < metro.beatsPerMeasure; i++) {
    const dot = document.createElement('span');
    dot.className = 'beat-dot' + (metro.accent && i === 0 ? ' accent' : '');
    wrap.appendChild(dot);
  }
}

function setBpmUI(v) {
  const bpm = metro.setBpm(v);
  $('bpm-val').textContent = bpm;
  $('bpm-range').value = Math.min(240, Math.max(40, bpm));
  savePrefs();
}

function wireMetronome() {
  // restore prefs
  metro.setBpm(prefs.bpm || 120);
  metro.setBeatsPerMeasure(prefs.beats || 4);
  metro.accent = prefs.accent !== false;
  $('time-sig').value = String(metro.beatsPerMeasure);
  $('accent').checked = metro.accent;
  $('bpm-val').textContent = metro.bpm;
  $('bpm-range').value = Math.min(240, Math.max(40, metro.bpm));
  buildBeatDots();

  metro.onBeat = (beat) => {
    const dots = $('beat-dots').children;
    [...dots].forEach((d, i) => d.classList.toggle('on', i === beat));
    setTimeout(() => { if (dots[beat]) dots[beat].classList.remove('on'); }, 120);
  };

  $('open-metro').addEventListener('click', showMetro);
  $('metro-fab').addEventListener('click', showMetro);
  $('metro-min').addEventListener('click', hideMetro);

  $('bpm-up').addEventListener('click', () => setBpmUI(metro.bpm + 1));
  $('bpm-down').addEventListener('click', () => setBpmUI(metro.bpm - 1));
  $('bpm-range').addEventListener('input', (e) => setBpmUI(e.target.value));

  $('time-sig').addEventListener('change', (e) => {
    metro.setBeatsPerMeasure(e.target.value);
    buildBeatDots();
    savePrefs();
  });
  $('accent').addEventListener('change', (e) => {
    metro.accent = e.target.checked;
    buildBeatDots();
    savePrefs();
  });

  $('metro-toggle').addEventListener('click', () => {
    metro.toggle();
    $('metro-toggle').textContent = metro.isRunning ? 'Parar' : 'Iniciar';
    $('metro-fab').classList.toggle('is-running', metro.isRunning);
  });

  // tap tempo
  let taps = [];
  $('tap').addEventListener('click', () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length >= 2) {
      const intervals = [];
      for (let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setBpmUI(60000 / avg);
    }
    if (taps.length > 6) taps = taps.slice(-6);
  });

  // load BPM from the current project
  $('bpm-to-metro').addEventListener('click', () => {
    const p = current();
    if (p && p.bpm) { setBpmUI(p.bpm); showMetro(); }
  });
}

function showMetro() { $('metronome').hidden = false; $('metro-fab').hidden = true; }
function hideMetro() {
  $('metronome').hidden = true;
  $('metro-fab').hidden = false;
  $('metro-fab').classList.toggle('is-running', metro.isRunning);
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */
async function init() {
  state.projects = await getProjects().catch(() => []);
  renderList();
  renderEditor();

  // editing
  ['p-title', 'p-status', 'p-bpm', 'p-key', 'p-genre', 'p-lyrics', 'p-notes'].forEach((id) => {
    const el = $(id);
    el.addEventListener('input', touch);
    el.addEventListener('change', touch);
  });

  $('new-project').addEventListener('click', createProject);
  $('delete-project').addEventListener('click', removeCurrent);
  $('toggle-preview').addEventListener('click', togglePreview);
  $('search').addEventListener('input', (e) => { state.filter = e.target.value; renderList(); });

  $('export').addEventListener('click', exportBackup);
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });
  $('pin-btn').addEventListener('click', managePin);

  wireTabs();
  wireMetronome();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

gate();
