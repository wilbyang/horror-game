import * as THREE from 'three';
import { SoundEngine } from './audio.js';
import { Maze, CELL_SIZE } from './maze.js';
import { Player } from './player.js';
import { Monster, MONSTER_STATE } from './monster.js';
import { KeyItem, ExitGate } from './keys.js';
import { UIController } from './ui.js';

const GAME_STATE = {
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  JUMPSCARE: 'JUMPSCARE',
  GAMEOVER: 'GAMEOVER',
  VICTORY: 'VICTORY'
};

class Game {
  constructor() {
    this.state = GAME_STATE.MENU;

    // Time tracking
    this.lastFrameTime = performance.now();
    this.gameTotalTime = 0;
    this.elapsedTime = 0;

    // Keys state
    this.collectedKeys = {
      ruby: false,
      sapphire: false,
      topaz: false
    };
    this.keysCount = 0;

    // Audio
    this.sound = new SoundEngine();

    // UI
    this.ui = new UIController();

    // Three.js Core
    this.container = document.getElementById('canvas-container');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c16);
    this.scene.fog = new THREE.FogExp2(0x0c0f1a, 0.022);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 120);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Ambient underground lighting
    const ambientLight = new THREE.AmbientLight(0x2a3248, 1.2);
    this.scene.add(ambientLight);

    // Soft ceiling/ground bounce light
    const hemiLight = new THREE.HemisphereLight(0x3d4963, 0x1e2029, 0.85);
    this.scene.add(hemiLight);

    // Player
    this.player = new Player(this.camera, this.renderer.domElement, this.sound);

    // World objects
    this.maze = null;
    this.monster = null;
    this.keys = [];
    this.exitGate = null;

    this.setupListeners();
    this.bindButtons();

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());

    // Start render loop
    requestAnimationFrame((t) => this.loop(t));
  }

  setupListeners() {
    // Pointer lock change listener
    this.player.controls.addEventListener('lock', () => {
      if (this.state === GAME_STATE.PAUSED) {
        this.state = GAME_STATE.PLAYING;
        this.ui.hidePause();
      }
    });

    this.player.controls.addEventListener('unlock', () => {
      if (this.state === GAME_STATE.PLAYING) {
        this.state = GAME_STATE.PAUSED;
        this.ui.showPause();
      }
    });

    // Keys: M or Tab for Sonar Radar pulse
    window.addEventListener('keydown', (e) => {
      if (this.state === GAME_STATE.PLAYING) {
        if (e.code === 'KeyM' || e.code === 'Tab') {
          e.preventDefault();
          this.triggerSonarPulse();
        }
      }
    });
  }

  bindButtons() {
    // Start Game Button
    const startBtn = document.getElementById('start-btn');
    startBtn.addEventListener('click', () => {
      this.sound.init();
      this.startNewGame();
    });

    // Retry Button
    const retryBtn = document.getElementById('retry-btn');
    retryBtn.addEventListener('click', () => {
      this.sound.resume();
      this.startNewGame();
    });

    // Play Again Button
    const playagainBtn = document.getElementById('playagain-btn');
    playagainBtn.addEventListener('click', () => {
      this.sound.resume();
      this.startNewGame();
    });

    // Resume Button
    const resumeBtn = document.getElementById('resume-btn');
    resumeBtn.addEventListener('click', () => {
      this.player.controls.lock();
    });

    // Quit to Menu Button
    const quitBtn = document.getElementById('quit-btn');
    quitBtn.addEventListener('click', () => {
      this.state = GAME_STATE.MENU;
      this.ui.showTitle();
    });
  }

  startNewGame() {
    // Clear previous game entities from scene if any
    if (this.maze) this.scene.remove(this.maze.group);
    if (this.monster) this.scene.remove(this.monster.group);
    if (this.exitGate) this.scene.remove(this.exitGate.group);
    this.keys.forEach(k => this.scene.remove(k.group));
    this.keys = [];

    // Reset game state
    this.ui.hideJumpscareOverlay();
    this.collectedKeys = { ruby: false, sapphire: false, topaz: false };
    this.keysCount = 0;
    this.ui.updateKeys(this.collectedKeys);

    // Determine maze size by difficulty (balanced compact & challenging)
    let mazeDimension = 21;
    if (this.ui.selectedDifficulty === 'easy') mazeDimension = 17;
    if (this.ui.selectedDifficulty === 'hard') mazeDimension = 25;

    // Generate Maze
    this.maze = new Maze(mazeDimension);
    this.maze.build3DWorld(this.scene);

    // Setup Exit Gate
    this.exitGate = new ExitGate(this.maze.exitPos);
    this.scene.add(this.exitGate.group);

    // Spawn 3 Keys
    this.keys = this.maze.keyPositions.map(info => {
      const keyItem = new KeyItem(info);
      this.scene.add(keyItem.group);
      return keyItem;
    });

    // Position Player at Spawn Safe Room
    this.player.resetPosition(this.maze.spawnPos);

    // Spawn Monster at distant open cell
    this.monster = new Monster(this.scene, this.maze, this.sound);
    this.spawnMonsterFarAway();

    // Adjust monster difficulty (always keeping monster slower than player's 4.4 walkSpeed)
    if (this.ui.selectedDifficulty === 'easy') {
      this.monster.patrolSpeed = 1.6;
      this.monster.chaseSpeed = 3.1;
    } else if (this.ui.selectedDifficulty === 'hard') {
      this.monster.patrolSpeed = 2.1;
      this.monster.chaseSpeed = 3.9;
    }

    // Hide modals and show HUD
    this.ui.titleScreen.style.display = 'none';
    this.ui.gameoverScreen.style.display = 'none';
    this.ui.victoryScreen.style.display = 'none';
    this.ui.pauseScreen.style.display = 'none';
    this.ui.showHUD();

    this.ui.notify('Find 3 Ancient Keys to unlock the South Exit Gate...');

    this.lastFrameTime = performance.now();
    this.gameTotalTime = 0;
    this.elapsedTime = 0;
    this.state = GAME_STATE.PLAYING;

    // Lock pointer for first-person control
    this.player.controls.lock();
  }

  spawnMonsterFarAway() {
    // Find an open walkable spot in the maze at least 35 units from player spawn
    let bestDist = 0;
    let bestPos = new THREE.Vector3();

    for (let attempts = 0; attempts < 50; attempts++) {
      const gx = 1 + Math.floor(Math.random() * (this.maze.size - 2));
      const gz = 1 + Math.floor(Math.random() * (this.maze.size - 2));

      if (this.maze.isWalkable(gx, gz)) {
        const wPos = this.maze.gridToWorld(gx, gz);
        const dist = wPos.distanceTo(this.maze.spawnPos);
        if (dist > bestDist) {
          bestDist = dist;
          bestPos.copy(wPos);
        }
      }
    }
    this.monster.spawn(bestPos);
  }

  triggerSonarPulse() {
    const success = this.ui.triggerSonar(
      this.maze,
      this.player.camera.position,
      this.getPlayerYaw(),
      this.monster.group.position,
      this.keys
    );
    if (success) {
      this.sound.playSonarPing();
    }
  }

  getPlayerYaw() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return Math.atan2(dir.x, -dir.z);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  loop() {
    requestAnimationFrame(() => this.loop());

    const now = performance.now();
    const delta = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;

    if (this.state === GAME_STATE.PLAYING) {
      this.gameTotalTime += delta;
      this.elapsedTime += delta;
      this.updateGame(delta, this.gameTotalTime);
    } else if (this.state === GAME_STATE.JUMPSCARE) {
      this.updateJumpscareSequence(delta);
    }

    this.renderer.render(this.scene, this.camera);
  }

  updateGame(delta, time) {
    const playerPos = this.player.camera.position;

    // Update Player movement & physics
    this.player.update(delta, this.maze);

    // Update Maze torches
    this.maze.updateTorches(time);

    // Update Keys animation & collection detection
    this.updateKeys(time, playerPos);

    // Update Exit Gate
    this.exitGate.update(delta, time);
    this.checkExitCollision(playerPos);

    // Check if player is shining flashlight directly at monster
    const isLightingMonster = this.player.isLightingObject(this.monster.group.position);
    const playerNoise = this.player.getNoiseLevel();

    // Update Monster AI with camera for spatial 3D audio
    this.monster.update(delta, playerPos, playerNoise, isLightingMonster, this.camera);

    // Distance to monster
    const monsterDist = this.monster.group.position.distanceTo(playerPos);
    const isChasing = (this.monster.state === MONSTER_STATE.CHASE);

    // Subtle physical ground rumble when heavy monster is stomping nearby
    if (monsterDist < 12 && (isChasing || this.monster.state === MONSTER_STATE.INVESTIGATE)) {
      const rumble = (1 - monsterDist / 12) * 0.016;
      this.camera.position.y += (Math.random() - 0.5) * rumble;
    }

    // Update Threat & Heartbeat
    const threat = this.ui.updateThreat(monsterDist, isChasing);
    this.sound.setThreatLevel(threat);

    // Update UI HUD
    this.ui.updateBars(
      (this.player.stamina / this.player.maxStamina) * 100,
      this.player.isExhausted,
      this.player.battery
    );
    // Update Compass with directional key markers & exit marker
    this.ui.updateCompass(this.getPlayerYaw(), playerPos, this.keys, this.exitGate);

    // Update Sonar Radar
    this.ui.updateSonar(
      delta,
      this.maze,
      playerPos,
      this.getPlayerYaw(),
      this.monster.group.position,
      this.keys
    );

    // Catch / Jumpscare check: Monster caught player!
    if (monsterDist < 1.35) {
      this.triggerGameOverCatch();
    }
  }

  updateKeys(time, playerPos) {
    let nearInteractable = false;
    let nearestKeyDist = Infinity;

    for (const key of this.keys) {
      key.update(time);

      if (!key.collected) {
        const dist = key.group.position.distanceTo(playerPos);
        if (dist < nearestKeyDist) {
          nearestKeyDist = dist;
        }

        // Check if looking near key
        if (dist < 3.5) {
          nearInteractable = true;
        }

        // Collect key
        if (dist < 1.8) {
          key.collected = true;
          this.scene.remove(key.group);

          this.collectedKeys[key.id] = true;
          this.keysCount++;

          this.sound.playKeyPickup();
          this.ui.updateKeys(this.collectedKeys);
          this.exitGate.insertKey(key.id);

          this.ui.notify(`Acquired ${key.name} (${this.keysCount}/3)!`);

          // Monster hears the key pickup disturbance!
          this.monster.hearNoise(playerPos);

          // All keys collected!
          if (this.keysCount === 3) {
            setTimeout(() => {
              this.sound.playGateUnlocked();
              this.exitGate.unlock();
              this.ui.notify('ALL 3 KEYS ACQUIRED! THE SOUTH EXIT GATE IS UNLOCKED! ESCAPE!', 6000);
            }, 800);
          }
        }
      }
    }

    // Play proximity harmonic audio chime when near an uncollected key
    if (nearestKeyDist < 24) {
      this.sound.updateKeyProximity(nearestKeyDist);
    }

    if (this.exitGate && this.exitGate.pos.distanceTo(playerPos) < 4.0) {
      nearInteractable = true;
    }

    if (nearInteractable) {
      this.ui.crosshair.classList.add('interact');
    } else {
      this.ui.crosshair.classList.remove('interact');
    }
  }

  checkExitCollision(playerPos) {
    if (!this.exitGate.isOpen) return;

    // Check distance to exit gateway portal
    const distToExit = this.exitGate.pos.distanceTo(playerPos);
    if (distToExit < 2.4) {
      this.triggerVictory();
    }
  }

  triggerGameOverCatch() {
    this.state = GAME_STATE.JUMPSCARE;
    this.player.controls.unlock();
    this.sound.playJumpscare();

    this.jumpscareStartTime = performance.now();
    this.jumpscareDuration = 2.8; // seconds
    this.jumpscarePlayerPos = this.camera.position.clone();
    this.jumpscareCamBaseY = this.camera.position.y;

    this.ui.startJumpscareOverlay();
  }

  updateJumpscareSequence(delta) {
    const elapsed = (performance.now() - this.jumpscareStartTime) / 1000;
    const progress = Math.min(1.0, elapsed / this.jumpscareDuration);

    // 1. Monster lunges into the camera lens with unhinged jaws and reaching claws
    this.monster.animateJumpscareLunge(progress, this.camera.position);

    // Move monster rapidly up to 0.45m from the camera face
    const toCam = new THREE.Vector3().subVectors(this.camera.position, this.monster.group.position);
    toCam.y = 0;
    if (toCam.length() > 0.45) {
      toCam.normalize();
      this.monster.group.position.addScaledVector(toCam, delta * 5.2);
    }

    // Camera locks directly on monster's terrifying gaping maw & glowing eyes
    const monsterMaw = new THREE.Vector3(
      this.monster.group.position.x,
      this.monster.group.position.y + 1.85,
      this.monster.group.position.z
    );
    this.camera.lookAt(monsterMaw);

    // Violent screen trauma vibration
    const shake = Math.sin(elapsed * 48) * Math.max(0.02, (1.0 - progress) * 0.12);
    this.camera.position.x = this.jumpscarePlayerPos.x + (Math.random() - 0.5) * shake;
    this.camera.position.z = this.jumpscarePlayerPos.z + (Math.random() - 0.5) * shake;

    // Player collapses to the bloody stone floor
    if (progress > 0.35) {
      const fallProg = Math.min(1.0, (progress - 0.35) / 0.45);
      this.camera.position.y = THREE.MathUtils.lerp(this.jumpscareCamBaseY, 0.35, fallProg);
      this.camera.rotation.z += Math.sin(fallProg * Math.PI * 0.5) * 0.65;
    }

    // 2. Render 2D arterial gore, claw scratches & blood drip overlay
    this.ui.renderJumpscareGore(progress);

    // 3. Complete kill & transition to Game Over
    if (progress >= 1.0) {
      this.state = GAME_STATE.GAMEOVER;
      this.ui.hideJumpscareOverlay();
      this.ui.showGameOver(this.elapsedTime, this.keysCount);
    }
  }

  triggerVictory() {
    this.state = GAME_STATE.VICTORY;
    this.player.controls.unlock();
    this.sound.playVictory();
    this.ui.showVictory(this.elapsedTime);
  }
}

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
