// Upload panel: add tracks from the browser.
//  • "Salvar no navegador" → stored locally (IndexedDB), plays on this device.
//  • "Publicar no site"     → committed to the repo via the GitHub API → goes live for everyone.
import { addLocalTrack, getLocalTracks, getLocalTrack, deleteLocalTrack, recordToTrack } from './store.js';
import { loadConfig, saveConfig, clearToken, verifyAccess, publishTrack, slugify } from './github.js';
import { iconFor } from './icons.js';
import { formatTime } from './player.js';

const $ = (id) => document.getElementById(id);
const DEFAULT_COVER = 'assets/default-cover.svg';
let selectedAudio = null;
let selectedCover = null;

// ---------- file selection ----------
function wireDropzone() {
  const dz = $('dropzone');
  const input = $('f-audio');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  ['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('is-over')));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('audio/'));
    if (file) setAudio(file);
  });
  input.addEventListener('change', () => { if (input.files[0]) setAudio(input.files[0]); });

  const cover = $('f-cover');
  cover.addEventListener('change', () => { selectedCover = cover.files[0] || null; renderCoverPreview(); });
}

function setAudio(file) {
  selectedAudio = file;
  $('audio-name').textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`;
  $('dropzone').classList.add('has-file');
  if (!$('f-title').value) $('f-title').value = file.name.replace(/\.[^.]+$/, '');
}

function renderCoverPreview() {
  const box = $('cover-preview');
  if (selectedCover) {
    box.style.backgroundImage = `url(${URL.createObjectURL(selectedCover)})`;
    box.classList.add('has-img');
  } else {
    box.style.backgroundImage = '';
    box.classList.remove('has-img');
  }
}

function getAudioDuration(blob) {
  return new Promise((resolve) => {
    const a = document.createElement('audio');
    a.preload = 'metadata';
    a.onloadedmetadata = () => { resolve(isFinite(a.duration) ? a.duration : null); URL.revokeObjectURL(a.src); };
    a.onerror = () => resolve(null);
    a.src = URL.createObjectURL(blob);
  });
}

function readForm() {
  return {
    title: $('f-title').value.trim() || (selectedAudio ? selectedAudio.name.replace(/\.[^.]+$/, '') : 'Sem título'),
    artist: $('f-artist').value.trim(),
    genre: $('f-genre').value.trim(),
    downloadable: $('f-downloadable').checked
  };
}

function setStatus(msg, kind = '') {
  const el = $('upload-status');
  el.textContent = msg;
  el.className = `status ${kind}`;
}

function resetForm() {
  $('upload-form').reset();
  selectedAudio = null; selectedCover = null;
  $('audio-name').textContent = '';
  $('dropzone').classList.remove('has-file');
  renderCoverPreview();
}

// ---------- save locally ----------
async function saveLocal() {
  if (!selectedAudio) return setStatus('Selecione um arquivo de áudio primeiro.', 'err');
  setStatus('Salvando no navegador…');
  const meta = readForm();
  const duration = await getAudioDuration(selectedAudio);
  const record = {
    id: `local-${Date.now()}`,
    title: meta.title,
    artist: meta.artist,
    genre: meta.genre,
    duration,
    downloadable: meta.downloadable,
    fileName: selectedAudio.name,
    audioBlob: selectedAudio,
    coverBlob: selectedCover || null,
    addedAt: new Date().toISOString()
  };
  await addLocalTrack(record);
  resetForm();
  setStatus('Faixa salva neste navegador. Ela já toca na página inicial (neste dispositivo).', 'ok');
  renderLocalList();
}

// ---------- publish to GitHub ----------
async function publish() {
  if (!selectedAudio) return setStatus('Selecione um arquivo de áudio primeiro.', 'err');
  const cfg = loadConfig();
  if (!cfg.token || !cfg.owner || !cfg.repo) {
    setStatus('Configure a publicação (token do GitHub) na aba "Publicação" abaixo.', 'err');
    location.hash = '#config';
    return;
  }
  const meta = readForm();
  const duration = await getAudioDuration(selectedAudio);
  try {
    disablePublish(true);
    await publishTrack(cfg, {
      audioBlob: selectedAudio, audioName: selectedAudio.name,
      coverBlob: selectedCover, coverName: selectedCover ? selectedCover.name : '',
      meta: { ...meta, duration }
    }, (step) => setStatus(step));
    resetForm();
    setStatus('Publicado! Em ~1–2 min o GitHub Actions atualiza o site para todos. 🎉', 'ok');
  } catch (e) {
    setStatus(`Erro ao publicar: ${e.message}`, 'err');
  } finally {
    disablePublish(false);
  }
}

function disablePublish(state) {
  $('publish-gh').disabled = state;
  $('save-local').disabled = state;
}

// ---------- local list ----------
async function renderLocalList() {
  const list = $('local-list');
  const empty = $('local-empty');
  const records = (await getLocalTracks().catch(() => []))
    .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  if (!records.length) { list.innerHTML = ''; empty.hidden = false; return; }
  empty.hidden = true;
  list.innerHTML = records.map((r) => `
    <li class="lrow" data-id="${r.id}">
      <span class="lrow-cover" style="${r.coverBlob ? `background-image:url(${URL.createObjectURL(r.coverBlob)})` : ''}"></span>
      <span class="lrow-meta">
        <strong>${escapeHTML(r.title)}</strong>
        <small>${escapeHTML(r.genre || r.artist || '')}${r.duration ? ' · ' + formatTime(r.duration) : ''}</small>
      </span>
      <span class="lrow-actions">
        <button class="btn-ghost" data-act="publish" title="Publicar no site">Publicar</button>
        <button class="btn-ghost danger" data-act="delete" title="Remover">Remover</button>
      </span>
    </li>`).join('');

  list.querySelectorAll('.lrow').forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      await deleteLocalTrack(id); renderLocalList();
    });
    row.querySelector('[data-act="publish"]').addEventListener('click', () => publishFromLocal(id));
  });
}

async function publishFromLocal(id) {
  const cfg = loadConfig();
  if (!cfg.token || !cfg.owner || !cfg.repo) {
    setStatus('Configure a publicação (token do GitHub) primeiro.', 'err');
    location.hash = '#config';
    return;
  }
  const r = await getLocalTrack(id);
  if (!r) return;
  try {
    setStatus(`Publicando "${r.title}"…`);
    await publishTrack(cfg, {
      audioBlob: r.audioBlob, audioName: r.fileName || `${slugify(r.title)}.mp3`,
      coverBlob: r.coverBlob, coverName: r.coverBlob ? 'cover.jpg' : '',
      meta: { title: r.title, artist: r.artist, genre: r.genre, duration: r.duration, downloadable: r.downloadable }
    }, (step) => setStatus(step));
    setStatus(`"${r.title}" publicada! O site será atualizado em ~1–2 min.`, 'ok');
  } catch (e) {
    setStatus(`Erro ao publicar: ${e.message}`, 'err');
  }
}

// ---------- GitHub config ----------
function fillConfig() {
  const cfg = loadConfig();
  $('gh-owner').value = cfg.owner;
  $('gh-repo').value = cfg.repo;
  $('gh-branch').value = cfg.branch;
  $('gh-token').value = cfg.token;
  reflectTokenState(cfg);
}

function reflectTokenState(cfg) {
  const ok = !!(cfg.token && cfg.owner && cfg.repo);
  const dot = $('gh-state-dot');
  if (dot) dot.className = `dot ${ok ? 'ok' : 'off'}`;
  $('gh-state-text').textContent = ok ? 'Publicação configurada' : 'Publicação não configurada (modo local disponível)';
}

function readConfigForm() {
  return {
    owner: $('gh-owner').value.trim(),
    repo: $('gh-repo').value.trim(),
    branch: $('gh-branch').value.trim() || 'main',
    token: $('gh-token').value.trim()
  };
}

function wireConfig() {
  $('gh-save').addEventListener('click', () => {
    const cfg = readConfigForm();
    saveConfig(cfg);
    reflectTokenState(cfg);
    $('gh-status').textContent = 'Configuração salva neste navegador.';
    $('gh-status').className = 'status ok';
  });
  $('gh-verify').addEventListener('click', async () => {
    const cfg = readConfigForm();
    saveConfig(cfg);
    $('gh-status').textContent = 'Verificando acesso…';
    $('gh-status').className = 'status';
    try {
      const login = await verifyAccess(cfg);
      reflectTokenState(cfg);
      $('gh-status').textContent = `Acesso OK como @${login} ao repositório ${cfg.owner}/${cfg.repo} (branch ${cfg.branch}).`;
      $('gh-status').className = 'status ok';
    } catch (e) {
      $('gh-status').textContent = `Falha: ${e.message}`;
      $('gh-status').className = 'status err';
    }
  });
  $('gh-clear').addEventListener('click', () => {
    clearToken();
    $('gh-token').value = '';
    reflectTokenState(loadConfig());
    $('gh-status').textContent = 'Token removido deste navegador.';
    $('gh-status').className = 'status';
  });
}

function escapeHTML(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function init() {
  // brand
  fetch('data/site.json').then((r) => r.json()).then((s) => {
    if (s.brand) { $('brand').textContent = s.brand; if (!$('f-artist').value) $('f-artist').value = s.brand; }
  }).catch(() => {});

  $('save-local').innerHTML = `${iconFor('download')}<span>Salvar no navegador</span>`;
  wireDropzone();
  wireConfig();
  fillConfig();
  renderLocalList();
  $('save-local').addEventListener('click', saveLocal);
  $('publish-gh').addEventListener('click', publish);
}

init();
