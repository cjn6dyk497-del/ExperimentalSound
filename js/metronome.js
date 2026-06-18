// Accurate Web Audio metronome using a lookahead scheduler.
// Pattern based on "A Tale of Two Clocks" — schedule clicks slightly ahead on
// the audio clock so timing stays rock-solid even if the JS timer drifts.
export class Metronome {
  constructor() {
    this.audioCtx = null;
    this.bpm = 120;
    this.beatsPerMeasure = 4;
    this.accent = true;
    this.isRunning = false;

    this.currentBeat = 0;          // beat index within the current measure
    this.nextNoteTime = 0;         // audioCtx time the next click is due
    this.lookahead = 25;           // ms — how often the scheduler wakes up
    this.scheduleAheadTime = 0.1;  // s — how far ahead clicks are scheduled
    this.timerID = null;

    this.onBeat = null;            // callback(beatIndex, isAccent) for the UI
  }

  _ensureCtx() {
    if (!this.audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AC();
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
  }

  _scheduleClick(beat, time) {
    const isAccent = this.accent && beat === 0;
    const osc = this.audioCtx.createOscillator();
    const env = this.audioCtx.createGain();
    osc.frequency.value = isAccent ? 1500 : 800;
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(isAccent ? 0.9 : 0.55, time + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(env).connect(this.audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.06);

    if (this.onBeat) {
      const delay = Math.max(0, (time - this.audioCtx.currentTime) * 1000);
      setTimeout(() => this.onBeat(beat, isAccent), delay);
    }
  }

  _advance() {
    this.nextNoteTime += 60.0 / this.bpm;
    this.currentBeat = (this.currentBeat + 1) % this.beatsPerMeasure;
  }

  _scheduler() {
    while (this.nextNoteTime < this.audioCtx.currentTime + this.scheduleAheadTime) {
      this._scheduleClick(this.currentBeat, this.nextNoteTime);
      this._advance();
    }
    this.timerID = setTimeout(() => this._scheduler(), this.lookahead);
  }

  start() {
    if (this.isRunning) return;
    this._ensureCtx();
    this.isRunning = true;
    this.currentBeat = 0;
    this.nextNoteTime = this.audioCtx.currentTime + 0.06;
    this._scheduler();
  }

  stop() {
    this.isRunning = false;
    clearTimeout(this.timerID);
    this.timerID = null;
  }

  toggle() { if (this.isRunning) this.stop(); else this.start(); }

  setBpm(v) {
    this.bpm = Math.min(300, Math.max(20, Math.round(Number(v)) || 120));
    return this.bpm;
  }

  setBeatsPerMeasure(v) {
    this.beatsPerMeasure = Math.min(12, Math.max(1, Math.round(Number(v)) || 4));
    return this.beatsPerMeasure;
  }
}
