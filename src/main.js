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

    // World & Level tracking
    this.currentWorld = 1;
    this.unlockedWorld2 = false;
    try {
      if (localStorage.getItem('horror_world2_unlocked') === 'true') {
        this.unlockedWorld2 = true;
      }
    } catch (e) {}

    // Time tracking
    this.lastFrameTime = performance.now();
    this.gameTotalTime = 0;
    this.elapsedTime = 0;

    // Keys state
    this.collectedKeys = {};
    this.keysCount = 0;

    // Audio
    this.sound = new SoundEngine();

    // UI
    this.ui = new UIController();
    this.ui.updateWorldUnlockState(this.unlockedWorld2);
    this.ui.setupWorldButtons((worldLevel) => {
      this.currentWorld = worldLevel;
    });

    // Three.js Core
    this.container = document.getElementById('canvas-container');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c16);
    this.scene.fog = new THREE.FogExp2(0x0c0f1a, 0.022);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 180);
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Ambient underground lighting
    this.ambientLight = new THREE.AmbientLight(0x2a3248, 1.2);
    this.scene.add(this.ambientLight);

    // Soft ceiling/ground bounce light
    this.hemiLight = new THREE.HemisphereLight(0x3d4963, 0x1e2029, 0.85);
    this.scene.add(this.hemiLight);

    // Player
    this.player = new Player(this.camera, this.renderer.domElement, this.sound);

    // World objects
    this.maze = null;
    this.monsters = [];
    this.killerMonster = null;
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
      this.startNewGame(this.currentWorld);
    });

    // Retry Button
    const retryBtn = document.getElementById('retry-btn');
    retryBtn.addEventListener('click', () => {
      this.sound.resume();
      this.startNewGame(this.currentWorld);
    });

    // Play Again Button (Replay active world)
    const playagainBtn = document.getElementById('playagain-btn');
    playagainBtn.addEventListener('click', () => {
      this.sound.resume();
      this.startNewGame(this.currentWorld);
    });

    // Enter World 2 Button (Appears on victory screen after beating World 1)
    const enterWorld2Btn = document.getElementById('btn-enter-world2');
    if (enterWorld2Btn) {
      enterWorld2Btn.addEventListener('click', () => {
        this.sound.resume();
        this.currentWorld = 2;
        this.ui.selectWorld(2);
        this.startNewGame(2);
      });
    }

    // Victory Return to Menu Button
    const victoryMenuBtn = document.getElementById('victory-menu-btn');
    if (victoryMenuBtn) {
      victoryMenuBtn.addEventListener('click', () => {
        this.state = GAME_STATE.MENU;
        this.ui.showTitle();
      });
    }

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

  startNewGame(worldLevel = this.currentWorld) {
    this.currentWorld = worldLevel;

    // Apply World-specific Atmosphere & Lighting
    if (this.currentWorld === 2) {
      this.scene.background.setHex(0x140409);
      this.scene.fog.color.setHex(0x140409);
      this.scene.fog.density = 0.024;
      this.ambientLight.color.setHex(0x3d101c);
      this.ambientLight.intensity = 1.35;
      this.hemiLight.color.setHex(0x4a1420);
      this.hemiLight.groundColor.setHex(0x1a060b);
      this.hemiLight.intensity = 0.9;
    } else {
      this.scene.background.setHex(0x0a0c16);
      this.scene.fog.color.setHex(0x0c0f1a);
      this.scene.fog.density = 0.022;
      this.ambientLight.color.setHex(0x2a3248);
      this.ambientLight.intensity = 1.2;
      this.hemiLight.color.setHex(0x3d4963);
      this.hemiLight.groundColor.setHex(0x1e2029);
      this.hemiLight.intensity = 0.85;
    }

    // Clear previous game entities from scene if any
    if (this.maze) this.scene.remove(this.maze.group);
    if (this.monsters) this.monsters.forEach(m => this.scene.remove(m.group));
    this.monsters = [];
    this.killerMonster = null;
    if (this.exitGate) this.scene.remove(this.exitGate.group);
    this.keys.forEach(k => this.scene.remove(k.group));
    this.keys = [];

    // Reset game state
    this.ui.hideJumpscareOverlay();
    this.collectedKeys = {};
    this.keysCount = 0;
    this.totalKeys = (this.currentWorld === 2) ? 5 : 3;
    this.ui.setWorld(this.currentWorld);
    this.ui.updateKeys(this.collectedKeys);

    // Determine maze size by difficulty
    let mazeDimension;
    if (this.currentWorld === 2) {
      // World 2: Larger and more expansive subterranean labyrinth (31x31 normal, 27x27 easy, 35x35 hard)
      mazeDimension = 31;
      if (this.ui.selectedDifficulty === 'easy') mazeDimension = 27;
      if (this.ui.selectedDifficulty === 'hard') mazeDimension = 35;
    } else {
      // World 1
      mazeDimension = 21;
      if (this.ui.selectedDifficulty === 'easy') mazeDimension = 17;
      if (this.ui.selectedDifficulty === 'hard') mazeDimension = 25;
    }

    // Generate Maze
    this.maze = new Maze(mazeDimension, this.currentWorld);
    this.maze.build3DWorld(this.scene);

    // Setup Exit Gate
    this.exitGate = new ExitGate(this.maze.exitPos, this.currentWorld);
    this.scene.add(this.exitGate.group);

    // Spawn Keys (3 for World 1, 5 for World 2)
    this.keys = this.maze.keyPositions.map(info => {
      const keyItem = new KeyItem(info);
      this.scene.add(keyItem.group);
      return keyItem;
    });

    // Position Player at Spawn Safe Room
    this.player.resetPosition(this.maze.spawnPos);

    // Spawn Monsters: World 1 has 1 Dread Walker; World 2 has 2 Abyssal Stalkers!
    const monsterCount = (this.currentWorld === 2) ? 2 : 1;
    this.monsters = [];

    for (let i = 0; i < monsterCount; i++) {
      const monster = new Monster(this.scene, this.maze, this.sound, this.currentWorld === 2);

      // Adjust monster difficulty
      if (this.currentWorld === 2) {
        // World 2: Abyssal Stalker is aggressive and faster than player's 4.4 walkSpeed!
        if (this.ui.selectedDifficulty === 'easy') {
          monster.patrolSpeed = 2.2;
          monster.chaseSpeed = 4.45;
        } else if (this.ui.selectedDifficulty === 'hard') {
          monster.patrolSpeed = 2.8;
          monster.chaseSpeed = 5.2;
        } else {
          monster.patrolSpeed = 2.5;
          monster.chaseSpeed = 4.75;
        }
      } else {
        // World 1: Dread Walker is slower than player's 4.4 walkSpeed
        if (this.ui.selectedDifficulty === 'easy') {
          monster.patrolSpeed = 1.6;
          monster.chaseSpeed = 3.1;
        } else if (this.ui.selectedDifficulty === 'hard') {
          monster.patrolSpeed = 2.1;
          monster.chaseSpeed = 3.9;
        } else {
          monster.patrolSpeed = 1.9;
          monster.chaseSpeed = 3.6;
        }
      }

      this.monsters.push(monster);
      this.spawnMonsterFarAway(monster);
    }

    // Hide modals and show HUD
    this.ui.titleScreen.style.display = 'none';
    this.ui.gameoverScreen.style.display = 'none';
    this.ui.victoryScreen.style.display = 'none';
    this.ui.pauseScreen.style.display = 'none';
    this.ui.showHUD();

    if (this.currentWorld === 2) {
      this.ui.notify('WORLD 2: Recover all 5 Abyssal Relics to escape through the Void Portal. TWO Stalkers are hunting you!', 5500);
    } else {
      this.ui.notify('Find 3 Ancient Keys to unlock the South Exit Gate...', 4000);
    }

    this.lastFrameTime = performance.now();
    this.gameTotalTime = 0;
    this.elapsedTime = 0;
    this.state = GAME_STATE.PLAYING;

    // Lock pointer for first-person control
    this.player.controls.lock();
  }

  spawnMonsterFarAway(monster) {
    // Find an open walkable spot in the maze distant from player spawn and any already-spawned monster
    let bestDist = 0;
    let bestPos = new THREE.Vector3();

    for (let attempts = 0; attempts < 90; attempts++) {
      const gx = 1 + Math.floor(Math.random() * (this.maze.size - 2));
      const gz = 1 + Math.floor(Math.random() * (this.maze.size - 2));

      if (this.maze.isWalkable(gx, gz)) {
        const wPos = this.maze.gridToWorld(gx, gz);
        const distToSpawn = wPos.distanceTo(this.maze.spawnPos);

        let distToOtherMonsters = 999;
        for (const other of this.monsters) {
          if (other !== monster && other.group.position.lengthSq() > 0.1) {
            const d = wPos.distanceTo(other.group.position);
            if (d < distToOtherMonsters) distToOtherMonsters = d;
          }
        }

        const score = distToSpawn + Math.min(distToOtherMonsters, 30);
        if (score > bestDist) {
          bestDist = score;
          bestPos.copy(wPos);
        }
      }
    }
    monster.spawn(bestPos);
  }

  triggerSonarPulse() {
    const monsterPositions = this.monsters.map(m => m.group.position);
    const success = this.ui.triggerSonar(
      this.maze,
      this.player.camera.position,
      this.getPlayerYaw(),
      monsterPositions,
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

    // Update all Monsters
    const playerNoise = this.player.getNoiseLevel();
    let nearestMonsterDist = Infinity;
    let anyMonsterChasing = false;
    let anyMonsterInvestigating = false;
    let caughtByMonster = null;

    for (const monster of this.monsters) {
      // Check if player is shining flashlight directly at this monster
      const isLighting = this.player.isLightingObject(monster.group.position);

      // Update Monster AI with camera for spatial 3D audio
      monster.update(delta, playerPos, playerNoise, isLighting, this.camera);

      // Flat horizontal distance to monster in maze
      const dist = Math.hypot(
        monster.group.position.x - playerPos.x,
        monster.group.position.z - playerPos.z
      );

      if (dist < nearestMonsterDist) {
        nearestMonsterDist = dist;
      }
      if (monster.state === MONSTER_STATE.CHASE) {
        anyMonsterChasing = true;
      }
      if (monster.state === MONSTER_STATE.INVESTIGATE) {
        anyMonsterInvestigating = true;
      }

      // Catch / Jumpscare check: Monster caught player!
      if (dist < 1.95 && !caughtByMonster) {
        caughtByMonster = monster;
      }
    }

    // Subtle physical ground rumble when heavy monster is stomping nearby
    if (nearestMonsterDist < 12 && (anyMonsterChasing || anyMonsterInvestigating)) {
      const rumble = (1 - nearestMonsterDist / 12) * 0.016;
      this.camera.position.y += (Math.random() - 0.5) * rumble;
    }

    // Update Threat & Heartbeat based on nearest monster
    const threat = this.ui.updateThreat(nearestMonsterDist, anyMonsterChasing);
    this.sound.setThreatLevel(threat);

    // Update UI HUD
    this.ui.updateBars(
      (this.player.stamina / this.player.maxStamina) * 100,
      this.player.isExhausted,
      this.player.battery
    );
    // Update Compass with directional key markers & exit marker
    this.ui.updateCompass(this.getPlayerYaw(), playerPos, this.keys, this.exitGate);

    // Update Sonar Radar with all monster positions
    const monsterPositions = this.monsters.map(m => m.group.position);
    this.ui.updateSonar(
      delta,
      this.maze,
      playerPos,
      this.getPlayerYaw(),
      monsterPositions,
      this.keys
    );

    // Catch / Jumpscare check
    if (caughtByMonster) {
      this.triggerGameOverCatch(caughtByMonster);
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

          this.ui.notify(`Acquired ${key.name} (${this.keysCount}/${this.totalKeys})!`);

          // All monsters hear the key pickup disturbance!
          this.monsters.forEach(m => m.hearNoise(playerPos));

          // All keys collected!
          if (this.keysCount === this.totalKeys) {
            setTimeout(() => {
              this.sound.playGateUnlocked();
              this.exitGate.unlock();
              const unlockMsg = (this.currentWorld === 2)
                ? 'ALL 5 ABYSSAL RELICS ACQUIRED! THE VOID PORTAL IS ACTIVE! ESCAPE!'
                : 'ALL 3 KEYS ACQUIRED! THE SOUTH EXIT GATE IS UNLOCKED! ESCAPE!';
              this.ui.notify(unlockMsg, 6000);
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

  triggerGameOverCatch(killerMonster = null) {
    this.state = GAME_STATE.JUMPSCARE;
    this.player.controls.unlock();
    this.sound.playJumpscare();

    this.killerMonster = killerMonster || this.monsters[0];
    const monster = this.killerMonster;

    this.jumpscareStartTime = performance.now();
    this.jumpscareDuration = 2.8; // seconds
    this.jumpscarePlayerPos = this.camera.position.clone();
    this.jumpscareCamBaseY = this.camera.position.y;

    // Place monster immediately 1.15m in front of the camera, directly facing player
    const monsterDir = new THREE.Vector3().subVectors(monster.group.position, this.camera.position);
    monsterDir.y = 0;
    if (monsterDir.length() < 0.2) {
      this.camera.getWorldDirection(monsterDir);
      monsterDir.y = 0;
    }
    monsterDir.normalize();

    monster.group.position.copy(this.camera.position).addScaledVector(monsterDir, 1.15);
    monster.group.position.y = 0;

    // Face monster directly towards camera
    monster.group.rotation.y = Math.atan2(-monsterDir.x, -monsterDir.z);

    // Lock camera directly on monster head
    monster.group.updateMatrixWorld(true);
    const headPos = new THREE.Vector3();
    monster.head.getWorldPosition(headPos);
    this.camera.lookAt(headPos);

    this.ui.hideHUD();
    this.ui.startJumpscareOverlay();
  }

  updateJumpscareSequence(delta) {
    const elapsed = (performance.now() - this.jumpscareStartTime) / 1000;
    const progress = Math.min(1.0, elapsed / this.jumpscareDuration);
    const monster = this.killerMonster || this.monsters[0];

    // 1. Monster lunges into the camera lens with unhinged jaws and reaching claws
    monster.animateJumpscareLunge(progress, this.camera.position);

    // Monster moves right up in front of the camera (head distance ~0.6m)
    const toCam = new THREE.Vector3().subVectors(this.camera.position, monster.group.position);
    toCam.y = 0;
    if (toCam.length() > 0.85) {
      toCam.normalize();
      monster.group.position.addScaledVector(toCam, delta * 3.5);
    }

    // Violent screen trauma vibration
    const shake = Math.sin(elapsed * 52) * Math.max(0.015, (1.0 - progress) * 0.12);
    this.camera.position.x = this.jumpscarePlayerPos.x + (Math.random() - 0.5) * shake;
    this.camera.position.z = this.jumpscarePlayerPos.z + (Math.random() - 0.5) * shake;

    // Keep camera at full eye height for the jumpscare so the roaring head is front-and-center!
    // Only in the final fatal bite (progress > 0.8) does the camera collapse
    let rollTilt = (Math.random() - 0.5) * 0.04;
    if (progress > 0.8) {
      const deathProg = (progress - 0.8) / 0.2;
      this.camera.position.y = THREE.MathUtils.lerp(this.jumpscareCamBaseY, 0.45, deathProg);
      rollTilt = Math.sin(deathProg * Math.PI * 0.5) * 0.5;
    } else {
      this.camera.position.y = this.jumpscareCamBaseY;
    }

    // Camera locks directly on monster's terrifying gaping head & glowing eyes
    monster.group.updateMatrixWorld(true);
    const headWorldPos = new THREE.Vector3();
    monster.head.getWorldPosition(headWorldPos);
    this.camera.lookAt(headWorldPos);
    if (rollTilt !== 0) {
      this.camera.rotation.z += rollTilt;
    }

    // Flashlight illuminates monster's head with dramatic bright flickering
    if (this.player.flashlight) {
      this.player.flashlight.visible = true;
      if (progress < 0.8) {
        this.player.flashlight.intensity = (Math.random() > 0.08) ? (5.5 + Math.random() * 3.5) : 1.0;
      } else {
        this.player.flashlight.intensity = 0;
      }
    }

    // 2. Render 2D arterial gore, claw scratches & blood drip overlay
    this.ui.renderJumpscareGore(progress);

    // 3. Complete kill & transition to Game Over
    if (progress >= 1.0) {
      this.state = GAME_STATE.GAMEOVER;
      this.ui.hideJumpscareOverlay();
      this.ui.showGameOver(this.elapsedTime, this.keysCount, this.totalKeys, this.currentWorld);
    }
  }

  triggerVictory() {
    this.state = GAME_STATE.VICTORY;
    this.player.controls.unlock();
    this.sound.playVictory();

    if (this.currentWorld === 1) {
      this.unlockedWorld2 = true;
      try {
        localStorage.setItem('horror_world2_unlocked', 'true');
      } catch (e) {}
      this.ui.updateWorldUnlockState(true);
      this.ui.showVictory(this.elapsedTime, 3, 1);
    } else {
      this.ui.showVictory(this.elapsedTime, 5, 2);
    }
  }
}

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
