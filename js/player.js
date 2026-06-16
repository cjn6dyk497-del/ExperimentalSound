// Fixed-bottom audio player with playlist support.
import { icons } from './icons.js';

const DEFAULT_COVER = 'assets/default-cover.svg';

export function formatTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export class Player {
  constructor() {
    this.audio = document.getElementById('audio');
    this.bar = document.getElementById('player');
    this.cover = document.getElementById('pl-cover');
    this.titleEl = document.getElementById('pl-title');
    this.artistEl = document.getElementById('pl-artist');
    this.playBtn = document.getElementById('pl-play');
    this.prevBtn = document.getElementById('pl-prev');
    this.nextBtn = document.getElementById('pl-next');
    this.seek = document.getElementById('pl-seek');
    this.curEl = document.getElementById('pl-current');
    this.durEl = document.getElementById('pl-duration');
    this.volume = document.getElementById('pl-volume');
    this.volBtn = document.getElementById('pl-volume-btn');
    this.downloadEl = document.getElementById('pl-download');

    this.playlist = [];
    this.index = -1;
    this.onIndexChange = null; // callback(index)

    this._bind();
  }

  _bind() {
    this.playBtn.addEventListener('click', () => this.toggle());
    this.prevBtn.addEventListener('click', () => this.prev());
    this.nextBtn.addEventListener('click', () => this.next());

    this.audio.addEventListener('play', () => this._renderPlayState());
    this.audio.addEventListener('pause', () => this._renderPlayState());
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('loadedmetadata', () => {
      this.durEl.textContent = formatTime(this.audio.duration);
      this.seek.max = Math.floor(this.audio.duration) || 0;
    });
    this.audio.addEventListener('timeupdate', () => {
      if (!this.seek.matches(':active')) {
        this.seek.value = Math.floor(this.audio.currentTime);
      }
      this.curEl.textContent = formatTime(this.audio.currentTime);
      this._renderProgress();
    });

    this.seek.addEventListener('input', () => {
      this.audio.currentTime = Number(this.seek.value);
      this._renderProgress();
    });

    this.volume.value = 1;
    this.volume.addEventListener('input', () => {
      this.audio.volume = Number(this.volume.value);
      this._renderVolumeIcon();
      this._renderVolumeFill();
    });
    if (this.volBtn) {
      this.volBtn.addEventListener('click', () => {
        this.audio.muted = !this.audio.muted;
        this._renderVolumeIcon();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.code === 'Space' && this.index >= 0) {
        e.preventDefault();
        this.toggle();
      }
    });

    // Static icons
    this.prevBtn.innerHTML = icons.prev;
    this.nextBtn.innerHTML = icons.next;
    if (this.downloadEl) this.downloadEl.innerHTML = icons.download;

    this._renderPlayState();
    this._renderVolumeIcon();
    this._renderVolumeFill();
  }

  setPlaylist(tracks) {
    this.playlist = tracks;
  }

  playIndex(i) {
    if (i < 0 || i >= this.playlist.length) return;
    this.index = i;
    const t = this.playlist[i];
    this.audio.src = t.src;
    this.audio.play().catch(() => {/* autoplay may be blocked until user gesture */});
    this._renderTrack(t);
    this.bar.classList.add('is-active');
    if (this.onIndexChange) this.onIndexChange(i);
  }

  playById(id) {
    const i = this.playlist.findIndex((t) => t.id === id);
    if (i >= 0) this.playIndex(i);
  }

  toggle() {
    if (this.index < 0 && this.playlist.length) return this.playIndex(0);
    if (this.audio.paused) this.audio.play(); else this.audio.pause();
  }

  next() {
    if (!this.playlist.length) return;
    this.playIndex((this.index + 1) % this.playlist.length);
  }

  prev() {
    if (!this.playlist.length) return;
    if (this.audio.currentTime > 3) { this.audio.currentTime = 0; return; }
    this.playIndex((this.index - 1 + this.playlist.length) % this.playlist.length);
  }

  _renderTrack(t) {
    this.cover.src = t.cover || DEFAULT_COVER;
    this.cover.onerror = () => { this.cover.src = DEFAULT_COVER; };
    this.titleEl.textContent = t.title;
    this.artistEl.textContent = t.artist || '';
    if (t.downloadable !== false) {
      this.downloadEl.hidden = false;
      this.downloadEl.href = t.src;
      this.downloadEl.setAttribute('download', t.fileName || `${t.title}.mp3`);
    } else {
      this.downloadEl.hidden = true;
    }
  }

  _renderPlayState() {
    const playing = !this.audio.paused && this.index >= 0;
    this.playBtn.innerHTML = playing ? icons.pause : icons.play;
    this.playBtn.setAttribute('aria-label', playing ? 'Pausar' : 'Tocar');
  }

  _renderProgress() {
    const pct = this.audio.duration ? (this.audio.currentTime / this.audio.duration) * 100 : 0;
    this.seek.style.setProperty('--fill', `${pct}%`);
  }

  _renderVolumeFill() {
    this.volume.style.setProperty('--fill', `${Number(this.volume.value) * 100}%`);
  }

  _renderVolumeIcon() {
    if (!this.volBtn) return;
    const muted = this.audio.muted || Number(this.volume.value) === 0;
    this.volBtn.innerHTML = muted ? icons.mute : icons.volume;
  }
}
