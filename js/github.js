// Publish tracks to the GitHub repository via the REST API, straight from the
// browser. This is what makes a "browser upload panel" actually go live on a
// static GitHub Pages site: the audio file + cover are committed to the repo
// and the data/tracks.json index is updated. The push triggers the Pages
// deploy workflow, so the track becomes public for every visitor.
//
// Auth uses a fine-grained Personal Access Token with "Contents: Read & write"
// on this repository. The token is provided by the producer and stored ONLY in
// this browser's localStorage — it is never committed or sent anywhere except
// api.github.com.

const API = 'https://api.github.com';
const LS_KEY = 'es_gh_config';

// --- config persistence (owner / repo / branch / token) ---
export function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (_) {}
  const auto = detectRepo();
  return {
    owner: cfg.owner || auto.owner || '',
    repo: cfg.repo || auto.repo || '',
    branch: cfg.branch || 'main',
    token: cfg.token || ''
  };
}

export function saveConfig(cfg) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

export function clearToken() {
  const cfg = loadConfig();
  delete cfg.token;
  saveConfig({ ...cfg, token: '' });
}

// Best-effort auto-detection from the GitHub Pages URL (username.github.io/repo/).
export function detectRepo() {
  const host = location.hostname; // e.g. user.github.io
  const out = { owner: '', repo: '' };
  const m = host.match(/^([^.]+)\.github\.io$/);
  if (m) {
    out.owner = m[1];
    const seg = location.pathname.split('/').filter(Boolean);
    if (seg.length) out.repo = seg[0];
    else out.repo = `${m[1]}.github.io`; // user/org root page
  }
  return out;
}

// --- helpers ---
function b64FromBuffer(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function b64FromString(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function strFromB64(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\s/g, ''))));
}

export function slugify(name) {
  return name
    .toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'faixa';
}

async function api(cfg, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const j = await res.json(); if (j.message) msg = j.message; } catch (_) {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// Verify token + repo access. Returns the authenticated login on success.
export async function verifyAccess(cfg) {
  if (!cfg.token) throw new Error('Informe um token do GitHub.');
  if (!cfg.owner || !cfg.repo) throw new Error('Informe owner e repositório.');
  const me = await api(cfg, '/user');
  // Confirm we can see the repo (and the branch).
  await api(cfg, `/repos/${cfg.owner}/${cfg.repo}/branches/${encodeURIComponent(cfg.branch)}`);
  return me.login;
}

async function putFile(cfg, path, contentB64, message, sha) {
  const body = { message, content: contentB64, branch: cfg.branch };
  if (sha) body.sha = sha;
  return api(cfg, `/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}

async function getJsonFile(cfg, path) {
  try {
    const data = await api(cfg, `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(cfg.branch)}`);
    return { json: JSON.parse(strFromB64(data.content)), sha: data.sha };
  } catch (e) {
    if (e.status === 404) return { json: { tracks: [] }, sha: null };
    throw e;
  }
}

/**
 * Publish one track to the repo.
 * @param cfg   {owner, repo, branch, token}
 * @param input {audioBlob, audioName, coverBlob?, coverName?, meta:{title,artist,genre,duration,downloadable}}
 * @param onStep optional progress callback (text)
 */
export async function publishTrack(cfg, input, onStep = () => {}) {
  const ts = Date.now();
  const base = slugify(input.meta.title);
  const audioExt = (input.audioName.split('.').pop() || 'mp3').toLowerCase();
  const audioPath = `audio/${base}-${ts}.${audioExt}`;

  onStep('Enviando arquivo de áudio…');
  const audioB64 = b64FromBuffer(await input.audioBlob.arrayBuffer());
  await putFile(cfg, audioPath, audioB64, `Add track: ${input.meta.title}`);

  let coverPath = '';
  if (input.coverBlob) {
    const coverExt = (input.coverName.split('.').pop() || 'jpg').toLowerCase();
    coverPath = `covers/${base}-${ts}.${coverExt}`;
    onStep('Enviando capa…');
    const coverB64 = b64FromBuffer(await input.coverBlob.arrayBuffer());
    await putFile(cfg, coverPath, coverB64, `Add cover: ${input.meta.title}`);
  }

  onStep('Atualizando lista de faixas…');
  const { json, sha } = await getJsonFile(cfg, 'data/tracks.json');
  if (!Array.isArray(json.tracks)) json.tracks = [];
  json.tracks.unshift({
    id: `gh-${ts}`,
    title: input.meta.title,
    artist: input.meta.artist || '',
    genre: input.meta.genre || '',
    src: audioPath,
    cover: coverPath,
    duration: input.meta.duration ?? null,
    downloadable: input.meta.downloadable !== false,
    fileName: `${base}.${audioExt}`,
    addedAt: new Date(ts).toISOString()
  });
  const updatedB64 = b64FromString(JSON.stringify(json, null, 2) + '\n');
  await putFile(cfg, 'data/tracks.json', updatedB64, `Publish track: ${input.meta.title}`, sha);

  onStep('Pronto! O deploy começa automaticamente.');
  return { audioPath, coverPath };
}
