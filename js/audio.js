/**
 * ComiconReader - Realistic Page Turning Web Audio Synthesizer
 * Generates authentic glossy paper whoosh, friction rustle, and page settling clicks
 * entirely in browser using Web Audio API synthesis (100% offline, zero latency).
 */

class PageFlipAudio {
  constructor() {
    this.audioCtx = null;
    this.enabled = true;
    this.volume = 0.65;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
        this.initialized = true;
      }
    } catch (e) {
      console.warn('Web Audio not supported or blocked:', e);
    }
  }

  ensureContext() {
    if (!this.initialized) this.init();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, parseFloat(val)));
  }

  setEnabled(bool) {
    this.enabled = !!bool;
  }

  /**
   * Synthesizes a realistic physical comic page flip
   * @param {string} type - 'turn', 'flutter', or 'soft'
   */
  playFlip(type = 'turn') {
    if (!this.enabled) return;
    this.ensureContext();
    if (!this.audioCtx) return;

    try {
      const ctx = this.audioCtx;
      const now = ctx.currentTime;
      const duration = 0.35 + Math.random() * 0.08;

      // Master gain for this sound effect
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.volume * 0.9, now);
      masterGain.connect(ctx.destination);

      // 1. Noise buffer generation for paper fiber friction
      const bufferSize = ctx.sampleRate * duration;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;

      for (let i = 0; i < bufferSize; i++) {
        // Pink-ish noise filter for soft organic paper feel
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      // 2. Dynamic Bandpass sweep (mimics page lifting, curving through air, and landing)
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.Q.setValueAtTime(2.2, now);
      bandpass.frequency.setValueAtTime(600 + Math.random() * 100, now);
      bandpass.frequency.exponentialRampToValueAtTime(2200 + Math.random() * 400, now + duration * 0.4);
      bandpass.frequency.exponentialRampToValueAtTime(700, now + duration);

      // Highpass to eliminate unnatural low rumble
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(320, now);

      // Amplitude Envelope: quick rustle in, smooth airflow curve, gentle tail
      const envGain = ctx.createGain();
      envGain.gain.setValueAtTime(0.001, now);
      envGain.gain.linearRampToValueAtTime(0.7, now + 0.04);
      envGain.gain.exponentialRampToValueAtTime(0.4, now + duration * 0.5);
      envGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      // 3. Subtle page fold snap / settle transient at the end of the turn
      const snapOsc = ctx.createOscillator();
      const snapGain = ctx.createGain();
      snapOsc.type = 'triangle';
      snapOsc.frequency.setValueAtTime(140 + Math.random() * 30, now + duration * 0.55);
      snapOsc.frequency.exponentialRampToValueAtTime(45, now + duration * 0.85);

      snapGain.gain.setValueAtTime(0.001, now);
      snapGain.gain.setValueAtTime(0.001, now + duration * 0.55);
      snapGain.gain.linearRampToValueAtTime(0.25, now + duration * 0.6);
      snapGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.85);

      // Connect noise pipeline
      noiseSource.connect(bandpass);
      bandpass.connect(highpass);
      highpass.connect(envGain);
      envGain.connect(masterGain);

      // Connect snap pipeline
      snapOsc.connect(snapGain);
      snapGain.connect(masterGain);

      // Start audio sources
      noiseSource.start(now);
      noiseSource.stop(now + duration);
      snapOsc.start(now + duration * 0.55);
      snapOsc.stop(now + duration * 0.88);

    } catch (e) {
      console.warn('Error synthesizing page flip sound:', e);
    }
  }
}

// Global audio singleton
window.flipAudio = new PageFlipAudio();
