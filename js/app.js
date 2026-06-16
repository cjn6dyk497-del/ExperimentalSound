// Public site: loads site config + tracks, renders the catalogue and wires the player.
import { Player, formatTime } from './player.js';
import { getLocalTracks, recordToTrack } from './store.js';
import { iconFor } from './icons.js';

const DEFAULT_COVER = 'assets/default-cover.svg';
const player = new Player();

async function loadJSON(url, fallback) {
  try {
    const res = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (_) {
    return fallback;
  }
}

function renderSite(site) {
  document.title = `${site.brand} · Produtor Musical`;
  setText('brand', site.brand);
  setText('brand-foot', site.brand);
  setText('tagline', site.tagline);
  setText('bio', site.bio);
  setText('hero-name', site.brand);
  setText('year', new Date().getFullYear());

  const socialsHTML = (site.socials || [])
    .filter((s) => s.url)
    .map((s) => `<a class="social" href="${escapeAttr(s.url)}" target="_blank" rel="noopener" aria-label="${escapeAttr(s.label)}" title="${escapeAttr(s.label)}">${iconFor(s.icon)}</a>`)
    .join('');
  setHTML('socials', socialsHTML);
  setHTML('socials-foot', socialsHTML);

  // Contact
  const emailLink = document.getElementById('contact-email');
  if (emailLink && site.email) {
    emailLink.href = `mailto:${site.email}`;
    emailLink.textContent = site.email;
  }
  setupContactForm(site);
}

function setupContactForm(site) {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const status = document.getElementById('contact-status');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    if (site.formspreeId) {
      try {
        status.textContent = 'Enviando…';
        const res = await fetch(`https://formspree.io/f/${site.formspreeId}`, {
          method: 'POST', body: data, headers: { Accept: 'application/json' }
        });
        if (res.ok) { status.textContent = 'Mensagem enviada! Obrigado.'; form.reset(); }
        else status.textContent = 'Não foi possível enviar. Tente pelo e-mail.';
      } catch (_) { status.textContent = 'Falha de rede. Tente pelo e-mail.'; }
    } else {
      // No Formspree configured: fall back to a prefilled e-mail.
      const subject = encodeURIComponent(`Contato pelo site — ${data.get('name') || ''}`);
      const body = encodeURIComponent(`${data.get('message') || ''}\n\nDe: ${data.get('name') || ''} <${data.get('email') || ''}>`);
      window.location.href = `mailto:${site.email}?subject=${subject}&body=${body}`;
      status.textContent = 'Abrindo seu aplicativo de e-mail…';
    }
  });
}

function trackCard(t, i) {
  const cover = t.cover || DEFAULT_COVER;
  const localBadge = t.source === 'local' ? '<span class="badge badge-local" title="Salva só neste navegador">local</span>' : '';
  const dl = t.downloadable !== false
    ? `<a class="card-dl" href="${escapeAttr(t.src)}" download="${escapeAttr(t.fileName || t.title)}" title="Baixar" aria-label="Baixar ${escapeAttr(t.title)}">${iconFor('download')}</a>`
    : '';
  const dur = t.duration ? `<span class="card-dur">${formatTime(t.duration)}</span>` : '';
  return `
    <article class="card" data-index="${i}" tabindex="0" role="button" aria-label="Tocar ${escapeAttr(t.title)}">
      <div class="card-art">
        <img src="${escapeAttr(cover)}" alt="" loading="lazy" onerror="this.src='${DEFAULT_COVER}'"/>
        <span class="card-play">${iconFor('play')}</span>
        ${localBadge}
      </div>
      <div class="card-meta">
        <h3 class="card-title">${escapeHTML(t.title)}</h3>
        <p class="card-sub">${escapeHTML(t.genre || t.artist || '')}</p>
        <div class="card-foot">${dur}${dl}</div>
      </div>
    </article>`;
}

function renderTracks(tracks) {
  const grid = document.getElementById('tracks');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('track-count');
  if (count) count.textContent = tracks.length ? `${tracks.length} faixa${tracks.length > 1 ? 's' : ''}` : '';

  if (!tracks.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  grid.innerHTML = tracks.map(trackCard).join('');

  grid.querySelectorAll('.card').forEach((el) => {
    const i = Number(el.dataset.index);
    const play = () => player.playIndex(i);
    el.addEventListener('click', (e) => { if (!e.target.closest('.card-dl')) play(); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); }
    });
  });
}

function highlightCurrent(i) {
  document.querySelectorAll('.card').forEach((el) => {
    el.classList.toggle('is-playing', Number(el.dataset.index) === i);
  });
}

async function init() {
  const [site, tracksData, localRecords] = await Promise.all([
    loadJSON('data/site.json', { brand: 'ExperimentaSound', socials: [], tagline: '', bio: '', email: '' }),
    loadJSON('data/tracks.json', { tracks: [] }),
    getLocalTracks().catch(() => [])
  ]);

  renderSite(site);

  const published = (tracksData.tracks || []).map((t) => ({
    ...t, artist: t.artist || site.brand, source: 'published'
  }));
  const local = localRecords
    .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''))
    .map(recordToTrack);

  const all = [...local, ...published];
  player.setPlaylist(all);
  player.onIndexChange = highlightCurrent;
  renderTracks(all);
}

// --- tiny DOM/escaping helpers ---
function setText(id, v) { const el = document.getElementById(id); if (el && v != null) el.textContent = v; }
function setHTML(id, v) { const el = document.getElementById(id); if (el) el.innerHTML = v; }
function escapeHTML(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHTML(s); }

init();
