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

  // Monster footsteps (spatially positioned, heavy thud + sharp talon click + close breath)
  playMonsterStep(distance, panAngle) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Attenuation based on distance (audible up to 38m)
    const maxDist = 38;
    if (distance > maxDist) return;

    // Rich volume curve: clearly audible when nearby
    const normDist = distance / maxDist;
    const vol = Math.pow(1 - normDist, 1.2) * 1.25;
    if (vol < 0.02) return;

    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panAngle)), now);
    }
    const dest = panner ? panner : this.masterGain;
    if (panner) panner.connect(this.masterGain);

    // 1. Heavy physical floor impact thud (audible on all speakers: 150Hz -> 55Hz)
    const thud = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thud.type = 'sawtooth';
    thud.frequency.setValueAtTime(145 + Math.random() * 20, now);
    thud.frequency.exponentialRampToValueAtTime(50, now + 0.24);

    const thudFilter = this.ctx.createBiquadFilter();
    thudFilter.type = 'lowpass';
    thudFilter.frequency.setValueAtTime(260, now);
    thudFilter.Q.setValueAtTime(2.2, now);

    thudGain.gain.setValueAtTime(vol * 0.95, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    thud.connect(thudFilter);
    thudFilter.connect(thudGain);
    thudGain.connect(dest);
    thud.start(now);
    thud.stop(now + 0.28);

    // 2. Sharp bone talon clicking on flagstones (1100Hz - 1600Hz crisp click)
    const clickBufLen = Math.floor(this.ctx.sampleRate * 0.08);
    const clickBuf = this.ctx.createBuffer(1, clickBufLen, this.ctx.sampleRate);
    const cData = clickBuf.getChannelData(0);
    for (let i = 0; i < clickBufLen; i++) {
      cData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clickBufLen * 0.18));
    }
    const clickSource = this.ctx.createBufferSource();
    clickSource.buffer = clickBuf;

    const clickFilter = this.ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.setValueAtTime(1250 + Math.random() * 350, now);
    clickFilter.Q.setValueAtTime(3.8, now);

    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(vol * 0.7, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    clickSource.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(dest);
    clickSource.start(now);

    // 3. Low guttural breath/snarl when close (< 18m)
    if (distance < 18) {
      const breathBufLen = Math.floor(this.ctx.sampleRate * 0.28);
      const breathBuf = this.ctx.createBuffer(1, breathBufLen, this.ctx.sampleRate);
      const bData = breathBuf.getChannelData(0);
      for (let i = 0; i < breathBufLen; i++) {
        bData[i] = (Math.random() * 2 - 1) * 0.45;
      }
      const breathSource = this.ctx.createBufferSource();
      breathSource.buffer = breathBuf;

      const breathFilter = this.ctx.createBiquadFilter();
      breathFilter.type = 'lowpass';
      breathFilter.frequency.setValueAtTime(360, now);

      const breathGain = this.ctx.createGain();
      const breathVol = (1 - distance / 18) * 0.5;
      breathGain.gain.setValueAtTime(breathVol, now);
      breathGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      breathSource.connect(breathFilter);
      breathFilter.connect(breathGain);
      breathGain.connect(dest);
      breathSource.start(now);
    }
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

  // Gentle harmonic chime ping when close to an ancient key
  updateKeyProximity(distance) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (distance > 22) return;

    if (!this.lastKeyPingTime || (now - this.lastKeyPingTime > 2.4)) {
      this.lastKeyPingTime = now;
      const vol = (1 - distance / 22) * 0.4;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';

      // Pitch rises as you draw closer: 659Hz (E5) up to 1046Hz (C6)
      const freq = 659.25 + (1 - distance / 22) * 387;
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 1.1);
    }
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

  // Visceral Jumpscare Kill Sound
  playJumpscare() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    const now = this.ctx.currentTime;

    // 1. Bone Crunch / Flesh Tear Transient
    const crunchLen = Math.floor(this.ctx.sampleRate * 0.45);
    const crunchBuf = this.ctx.createBuffer(1, crunchLen, this.ctx.sampleRate);
    const cData = crunchBuf.getChannelData(0);
    for (let i = 0; i < crunchLen; i++) {
      cData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (crunchLen * 0.25));
    }
    const crunchSource = this.ctx.createBufferSource();
    crunchSource.buffer = crunchBuf;
    const crunchFilter = this.ctx.createBiquadFilter();
    crunchFilter.type = 'lowpass';
    crunchFilter.frequency.setValueAtTime(800, now);
    crunchFilter.frequency.exponentialRampToValueAtTime(120, now + 0.35);

    const crunchGain = this.ctx.createGain();
    crunchGain.gain.setValueAtTime(1.0, now);
    crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    crunchSource.connect(crunchFilter);
    crunchFilter.connect(crunchGain);
    crunchGain.connect(this.masterGain);
    crunchSource.start(now);

    // 2. Ear-Piercing Eldritch Shriek (Dual chaotic sweep)
    const scream1 = this.ctx.createOscillator();
    const scream2 = this.ctx.createOscillator();
    const screamGain = this.ctx.createGain();

    scream1.type = 'sawtooth';
    scream2.type = 'sawtooth';

    scream1.frequency.setValueAtTime(450, now);
    scream1.frequency.exponentialRampToValueAtTime(1600, now + 0.12);
    scream1.frequency.exponentialRampToValueAtTime(280, now + 1.6);

    scream2.frequency.setValueAtTime(470, now);
    scream2.frequency.exponentialRampToValueAtTime(1580, now + 0.14);
    scream2.frequency.exponentialRampToValueAtTime(270, now + 1.6);

    const screamFilter = this.ctx.createBiquadFilter();
    screamFilter.type = 'bandpass';
    screamFilter.frequency.setValueAtTime(1100, now);
    screamFilter.Q.setValueAtTime(5.0, now);

    screamGain.gain.setValueAtTime(0.9, now);
    screamGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    scream1.connect(screamFilter);
    scream2.connect(screamFilter);
    screamFilter.connect(screamGain);
    screamGain.connect(this.masterGain);

    scream1.start(now);
    scream2.start(now);
    scream1.stop(now + 1.8);
    scream2.stop(now + 1.8);

    // 3. Heavy Sub-Bass Impact Slam
    const boom = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(130, now);
    boom.frequency.exponentialRampToValueAtTime(28, now + 0.85);
    boomGain.gain.setValueAtTime(1.2, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

    boom.connect(boomGain);
    boomGain.connect(this.masterGain);
    boom.start(now);
    boom.stop(now + 1.4);

    // 4. Eerie Heart Flatline tone after kill
    const flatline = this.ctx.createOscillator();
    const flatlineGain = this.ctx.createGain();
    flatline.type = 'sine';
    flatline.frequency.setValueAtTime(880, now + 1.0);

    flatlineGain.gain.setValueAtTime(0.001, now);
    flatlineGain.gain.setValueAtTime(0.001, now + 0.95);
    flatlineGain.gain.linearRampToValueAtTime(0.2, now + 1.1);
    flatlineGain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);

    flatline.connect(flatlineGain);
    flatlineGain.connect(this.masterGain);
    flatline.start(now + 1.0);
    flatline.stop(now + 3.0);
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

  // Co-op Radio Ping Beacon ('Q' key)
  playPingBeacon() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // A5
    osc.frequency.setValueAtTime(1320, now + 0.08); // E6

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  // Teammate Revived Adrenaline Surge
  playReviveSound() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.5);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  // Emergency Alert when Teammate is downed
  playTeammateDowned() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = now + i * 0.18;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(750, startTime);
      osc.frequency.exponentialRampToValueAtTime(350, startTime + 0.15);

      gain.gain.setValueAtTime(0.5, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.16);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(startTime);
      osc.stop(startTime + 0.16);
    }
  }
}
