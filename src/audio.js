// Web Audio API procedural sound engine for atmospheric horror
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.ambientGain = null;
    this.isMuted = false;
    this.initialized = false;

    // Heartbeat state
    this.heartbeatTimer = null;
    this.heartbeatInterval = 1000;
    this.threatLevel = 0; // 0 to 1

    // Ambient drone nodes
    this.droneOscs = [];

    // Footstep timing
    this.lastPlayerStepTime = 0;
    this.stepCadence = 0.5; // seconds
  }

  init() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    this.ambientGain.connect(this.masterGain);

    this.startAmbientDrone();
    this.startHeartbeatLoop();
    this.initialized = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  startAmbientDrone() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Deep sub bass oscillator (48 Hz)
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(43.65, now); // F1

    const subFilter = this.ctx.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(95, now);
    subFilter.Q.setValueAtTime(4, now);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.25, now);

    subOsc.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(this.ambientGain);
    subOsc.start();
    this.droneOscs.push(subOsc);

    // Eerie wind / rumble noise
    const bufferSize = this.ctx.sampleRate * 3;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.4;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(140, now);
    noiseFilter.Q.setValueAtTime(2.5, now);

    // Modulate noise filter for wind howling effect
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.12, now);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(60, now);
    lfo.connect(lfoGain);
    lfoGain.connect(noiseFilter.frequency);
    lfo.start();
    this.droneOscs.push(lfo);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.12, now);

    whiteNoise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ambientGain);
    whiteNoise.start();
    this.droneOscs.push(whiteNoise);
  }

  // Set threat level (0.0: calm to 1.0: monster right behind player)
  setThreatLevel(level) {
    this.threatLevel = Math.max(0, Math.min(1, level));
    if (this.threatLevel <= 0.05) {
      this.heartbeatInterval = 1400;
    } else {
      // Scale interval between 1000ms (far) and 320ms (terrifyingly fast)
      this.heartbeatInterval = 1000 - this.threatLevel * 680;
    }
  }

  startHeartbeatLoop() {
    const tick = () => {
      if (this.ctx && this.threatLevel > 0.05) {
        this.playHeartbeat(this.threatLevel);
      }
      this.heartbeatTimer = setTimeout(tick, this.heartbeatInterval);
    };
    this.heartbeatTimer = setTimeout(tick, this.heartbeatInterval);
  }

  playHeartbeat(intensity) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const vol = Math.min(1.0, 0.2 + intensity * 0.8);

    // First beat ("lub")
    this.createHeartThump(now, 68, 42, 0.12, vol);
    // Second beat ("dub")
    this.createHeartThump(now + 0.13, 56, 36, 0.14, vol * 0.75);
  }

  createHeartThump(time, startFreq, endFreq, duration, volume) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';

    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration);

    gain.gain.setValueAtTime(volume * 0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + duration);
  }

  // Player footsteps
  playPlayerStep(isSprinting) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const duration = isSprinting ? 0.08 : 0.1;
    const vol = isSprinting ? 0.45 : 0.25;

    // Low stone thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const pitch = isSprinting ? (80 + Math.random() * 20) : (65 + Math.random() * 15);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + duration);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Stone scuff noise
    const noiseLength = duration * 0.8;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * noiseLength), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.3;
    }
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buf;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(600 + Math.random() * 200, now);
    noiseFilter.Q.setValueAtTime(1.5, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(vol * 0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseLength);

    osc.connect(gain);
    gain.connect(this.masterGain);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration);
    noiseSource.start(now);
    noiseSource.stop(now + noiseLength);
  }

  // Monster footsteps (spatially positioned & heavy dragging)
  playMonsterStep(distance, panAngle) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Attenuation based on distance (audible up to 45m)
    const maxDist = 45;
    if (distance > maxDist) return;
    const vol = Math.pow(1 - distance / maxDist, 1.8) * 0.9;
    if (vol < 0.01) return;

    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panAngle)), now);
    }

    // Heavy footstep impact
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(48 + Math.random() * 12, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.22);

    gain.gain.setValueAtTime(vol * 1.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    // Dragging gravel / bone scrape
    const bufLen = Math.floor(this.ctx.sampleRate * 0.18);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(vol * 0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    const dest = panner ? panner : this.masterGain;
    if (panner) panner.connect(this.masterGain);

    osc.connect(gain);
    gain.connect(dest);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(dest);

    osc.start(now);
    osc.stop(now + 0.25);
    noise.start(now);
    noise.stop(now + 0.18);
  }

  // Monster growl / screech
  playMonsterRoar(distance, isChasing) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const maxDist = 50;
    if (distance > maxDist) return;
    const vol = Math.pow(1 - distance / maxDist, 1.3) * 0.85;

    // Screech oscillator
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';

    const baseFreq = isChasing ? 380 : 160;
    osc1.frequency.setValueAtTime(baseFreq, now);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 2.2, now + 0.3);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + 0.9);

    osc2.frequency.setValueAtTime(baseFreq * 1.05, now);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 2.1, now + 0.3);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.48, now + 0.9);

    // Distortion filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(baseFreq * 1.5, now);
    filter.Q.setValueAtTime(4.0, now);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(vol * 0.9, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.1);
    osc2.stop(now + 1.1);
  }

  // Flashlight click
  playFlashlightClick() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.035);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.04);
  }

  // Key pickup chime
  playKeyPickup() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const startTime = now + idx * 0.09;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.4, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.8);
    });

    // Deep resonant gong
    const gong = this.ctx.createOscillator();
    const gongGain = this.ctx.createGain();
    gong.type = 'triangle';
    gong.frequency.setValueAtTime(110, now);
    gongGain.gain.setValueAtTime(0.5, now);
    gongGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    gong.connect(gongGain);
    gongGain.connect(this.masterGain);
    gong.start(now);
    gong.stop(now + 1.8);
  }

  // Gate unlocked fanfare / sound
  playGateUnlocked() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Heavy stone grind & chain clanking
    for (let i = 0; i < 4; i++) {
      const clankTime = now + i * 0.25;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(130 - i * 15, clankTime);
      gain.gain.setValueAtTime(0.5, clankTime);
      gain.gain.exponentialRampToValueAtTime(0.001, clankTime + 0.3);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(350, clankTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(clankTime);
      osc.stop(clankTime + 0.35);
    }
  }

  // Jumpscare death sound
  playJumpscare() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Screaming dissonant chord
    const freqs = [220, 233.08, 311.13, 440, 466.16, 622.25];
    freqs.forEach(freq => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.1);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.3, now + 1.2);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 1.4);
    });

    // Sub explosion
    const boom = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(110, now);
    boom.frequency.exponentialRampToValueAtTime(25, now + 0.8);
    boomGain.gain.setValueAtTime(1.0, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    boom.connect(boomGain);
    boomGain.connect(this.masterGain);
    boom.start(now);
    boom.stop(now + 1.2);
  }

  // Victory escape sound
  playVictory() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const chords = [
      [261.63, 329.63, 392.00], // C
      [293.66, 369.99, 440.00], // D
      [329.63, 392.00, 493.88], // Em
      [523.25, 659.25, 783.99]  // High C
    ];

    chords.forEach((chord, cIdx) => {
      const chordTime = now + cIdx * 0.6;
      chord.forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, chordTime);

        gain.gain.setValueAtTime(0.3, chordTime);
        gain.gain.exponentialRampToValueAtTime(0.001, chordTime + 1.2);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(chordTime);
        osc.stop(chordTime + 1.2);
      });
    });
  }

  // Sonar radar pulse ping sound
  playSonarPing() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.4);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.45);
  }

  // Monster stunned sound
  playMonsterStunned() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.6);

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.7);
  }
}
