import * as THREE from 'three';
import { SoundEngine } from './audio.js';
import { Maze, CELL_SIZE } from './maze.js';
import { Player } from './player.js';
import { Monster, MONSTER_STATE } from './monster.js';
import { KeyItem, ExitGate } from './keys.js';
import { UIController } from './ui.js';
import { NetworkManager } from './network.js';
import { RemotePlayer } from './remotePlayer.js';

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
    this.unlockedWorld2 = true; // Unlocked by default!

    // Multiplayer Co-op State
    this.gameMode = 'solo'; // 'solo' or 'coop'
    this.network = new NetworkManager();
    this.remotePlayer = null;
    this.isCoopHost = false;
    this.coopConnected = false;
    this.coopRoomCode = '';
    this.teammateDowned = false;
    this.myDownedTimer = 0;
    this.reviveHoldTimer = 0;
    this.networkSendTimer = 0;

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
    this.ui.setupModeButtons((mode) => {
      this.gameMode = mode;
      if (mode === 'solo') {
        this.coopConnected = false;
        this.network.cleanup();
      }
    });
    this.setupCoop();

    // Check URL parameters for ?room=XXXX
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      this.ui.setMode('coop');
      if (this.ui.joinRoomInput) this.ui.joinRoomInput.value = roomParam.toUpperCase();
      setTimeout(() => this.joinCoopRoom(roomParam.toUpperCase()), 300);
    }

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
      if (this.state === GAME_STATE.PAUSED || this.gameMode === 'coop') {
        if (this.state === GAME_STATE.PAUSED) {
          this.state = GAME_STATE.PLAYING;
        }
        this.ui.hidePause();
      }
    });

    this.player.controls.addEventListener('unlock', () => {
      if (this.state === GAME_STATE.PLAYING) {
        if (this.gameMode === 'coop') {
          this.ui.showPause();
        } else {
          this.state = GAME_STATE.PAUSED;
          this.ui.showPause();
        }
      }
    });

    // Clicking anywhere on the screen locks controls when playing
    window.addEventListener('click', (e) => {
      if (this.state === GAME_STATE.PLAYING && !this.player.controls.isLocked) {
        if (e.target && (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT')) return;
        try {
          this.player.controls.lock();
        } catch (err) {}
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
    this.player.onQuickPing = () => this.handleQuickPing();
  }

  setupCoop() {
    this.ui.setupCoopButtons(
      () => this.createCoopRoom(),
      (code) => this.joinCoopRoom(code),
      () => this.copyInviteLink()
    );
  }

  createCoopRoom() {
    const code = NetworkManager.generateRoomCode();
    this.coopRoomCode = code;
    this.isCoopHost = true;
    this.ui.setHostPending(code);

    this.network.hostRoom(code, {
      onReady: (confirmedCode) => {
        this.coopRoomCode = confirmedCode;
        this.ui.setHostCode(confirmedCode);
        this.ui.notify(`Room [${confirmedCode}] is online! Share code with your teammate.`, 4000);
      },
      onConnected: () => {
        this.coopConnected = true;
        this.ui.setCoopConnected('host', true);
        this.sound.playPingBeacon();
        this.ui.notify('Player 2 connected! Ready to launch co-op expedition.', 4000);
      },
      onDisconnected: () => {
        this.coopConnected = false;
        this.ui.setCoopConnected('host', false);
        this.ui.setHostStatus('Player 2 disconnected.');
        this.ui.notify('Player 2 disconnected.', 3000);
      },
      onMessage: (msg) => this.handleNetworkMessage(msg),
      onError: (err) => {
        this.ui.setHostStatus(err);
      }
    });
  }

  joinCoopRoom(code) {
    const cleanCode = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanCode || cleanCode.length < 3) {
      this.ui.setJoinStatus('Please enter a valid 4-letter room code!');
      return;
    }
    this.coopRoomCode = cleanCode;
    this.isCoopHost = false;
    this.ui.setJoinStatus(`Searching for room [${cleanCode}]...`);

    this.network.joinRoom(cleanCode, {
      onProgress: (statusText) => {
        this.ui.setJoinStatus(statusText);
      },
      onConnected: () => {
        this.coopConnected = true;
        this.ui.setCoopConnected('guest', true);
        this.sound.playPingBeacon();
        this.ui.notify(`Connected to Host room [${cleanCode}]! Waiting for Host to start...`, 4500);
      },
      onDisconnected: () => {
        this.coopConnected = false;
        this.ui.setCoopConnected('guest', false);
        this.ui.setJoinStatus('Disconnected from Host.');
        this.ui.notify('Disconnected from Host.', 3000);
      },
      onMessage: (msg) => this.handleNetworkMessage(msg),
      onError: (err) => {
        this.ui.setJoinStatus(err);
        this.ui.notify(err, 4500);
      }
    });
  }

  copyInviteLink() {
    if (!this.coopRoomCode) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${this.coopRoomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      this.ui.notify('Invite link copied to clipboard!', 3000);
    }).catch(() => {
      this.ui.notify(`Share code: ${this.coopRoomCode}`, 3000);
    });
  }

  handleQuickPing() {
    this.sound.playPingBeacon();
    this.ui.notify('You pinged your location!', 2000);
    if (this.gameMode === 'coop' && this.network.isConnected) {
      const pos = this.player.camera.position;
      this.network.send({ type: 'QUICK_PING', x: pos.x, y: pos.y, z: pos.z });
    }
  }

  handleNetworkMessage(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'START_COOP_GAME':
        this.startCoopGameAsGuest(msg);
        break;

      case 'PLAYER_MOVE':
        if (this.remotePlayer) {
          // Survivor avatar is grounded on the floor (y = 0)
          this.remotePlayer.targetPos.set(msg.x, 0, msg.z);
          this.remotePlayer.targetYaw = msg.yaw;
          this.remotePlayer.targetPitch = msg.pitch;
          this.remotePlayer.isSprinting = msg.isSprinting;
          this.remotePlayer.setFlashlight(msg.flashlightOn);
          if (msg.isDowned !== undefined) {
            this.remotePlayer.setDowned(msg.isDowned);
            this.teammateDowned = msg.isDowned;
          }
        }
        break;

      case 'MONSTER_SYNC':
        if (!this.isCoopHost && this.monsters.length > 0 && msg.monsters) {
          msg.monsters.forEach((mData, idx) => {
            if (this.monsters[idx]) {
              const m = this.monsters[idx];
              if (!m.targetPos) m.targetPos = new THREE.Vector3().copy(m.group.position);
              m.targetPos.set(mData.x, mData.y, mData.z);
              m.targetRotY = mData.rotY;
              m.state = mData.state;
            }
          });
        }
        break;

      case 'KEY_COLLECTED':
        this.handleRemoteKeyPickup(msg.keyId);
        break;

      case 'REVIVE_TEAMMATE':
        this.player.setDowned(false);
        this.myDownedTimer = 0;
        this.ui.showDownedBanner(false);
        this.sound.playReviveSound();
        this.ui.notify('Your teammate revived you with adrenaline!', 4000);
        break;

      case 'DOWNED_ALERT':
        this.teammateDowned = true;
        if (this.remotePlayer) this.remotePlayer.setDowned(true);
        this.sound.playTeammateDowned();
        this.ui.notify('⚠️ TEAMMATE DOWNED! Reach their location to revive them!', 5000);
        break;

      case 'QUICK_PING':
        this.sound.playPingBeacon();
        this.ui.notify('Teammate pinged nearby!', 2500);
        break;

      case 'COOP_VICTORY':
        this.triggerVictory();
        break;

      case 'COOP_GAMEOVER':
        this.state = GAME_STATE.GAMEOVER;
        this.ui.hideHUD();
        this.ui.showGameOver(this.elapsedTime, this.keysCount, this.totalKeys, this.currentWorld);
        break;
    }
  }

  handleRemoteKeyPickup(keyId) {
    const key = this.keys.find(k => k.id === keyId);
    if (key && !key.collected) {
      key.collected = true;
      this.scene.remove(key.group);
      this.collectedKeys[key.id] = true;
      this.keysCount++;

      this.sound.playKeyPickup();
      this.ui.updateKeys(this.collectedKeys);
      this.exitGate.insertKey(key.id);
      this.ui.notify(`Teammate acquired ${key.name} (${this.keysCount}/${this.totalKeys})!`, 4000);

      // Alert all monsters
      if (this.isCoopHost) {
        this.monsters.forEach(m => m.hearNoise(this.player.camera.position));
      }

      // Check gate unlock
      if (this.keysCount === this.totalKeys) {
        setTimeout(() => {
          this.sound.playGateUnlocked();
          this.exitGate.unlock();
          const unlockMsg = (this.currentWorld === 2)
            ? 'ALL 5 RELICS ACQUIRED! VOID PORTAL ACTIVE! ESCAPE TOGETHER!'
            : 'ALL 3 KEYS ACQUIRED! SOUTH EXIT GATE UNLOCKED! ESCAPE TOGETHER!';
          this.ui.notify(unlockMsg, 6000);
        }, 800);
      }
    }
  }

  bindButtons() {
    // Start Game Button
    const startBtn = document.getElementById('start-btn');
    startBtn.addEventListener('click', () => {
      if (this.gameMode === 'coop') {
        if (!this.coopRoomCode) {
          this.ui.notify('Please Create a Room (Host) or enter a Code to Join first!', 4000);
          return;
        }
        if (!this.isCoopHost) {
          this.ui.notify('Joined as Player 2. Waiting for Host to launch the game!', 3500);
          return;
        }
        if (!this.coopConnected) {
          this.ui.notify(`Room [${this.coopRoomCode}] created! Share code and wait for Player 2 to join.`, 4500);
          return;
        }
      }
      this.sound.init();
      this.startNewGame(this.currentWorld);
    });

    // Retry Button
    const retryBtn = document.getElementById('retry-btn');
    retryBtn.addEventListener('click', () => {
      if (this.gameMode === 'coop' && !this.isCoopHost) {
        this.ui.notify('Only the Host can restart the co-op session!', 3000);
        return;
      }
      this.sound.resume();
      this.startNewGame(this.currentWorld);
    });

    // Play Again Button (Replay active world)
    const playagainBtn = document.getElementById('playagain-btn');
    playagainBtn.addEventListener('click', () => {
      if (this.gameMode === 'coop' && !this.isCoopHost) {
        this.ui.notify('Only the Host can start the next game!', 3000);
        return;
      }
      this.sound.resume();
      this.startNewGame(this.currentWorld);
    });

    // Enter World 2 Button (Appears on victory screen after beating World 1)
    const enterWorld2Btn = document.getElementById('btn-enter-world2');
    if (enterWorld2Btn) {
      enterWorld2Btn.addEventListener('click', () => {
        if (this.gameMode === 'coop' && !this.isCoopHost) {
          this.ui.notify('Only the Host can select the next world!', 3000);
          return;
        }
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
    if (this.remotePlayer) {
      this.remotePlayer.destroy();
      this.remotePlayer = null;
    }

    // Reset game state
    this.ui.hideJumpscareOverlay();
    this.player.setDowned(false);
    this.teammateDowned = false;
    this.myDownedTimer = 0;
    this.reviveHoldTimer = 0;
    this.ui.showDownedBanner(false);
    this.ui.showRevivePrompt(false);
    this.collectedKeys = {};
    this.keysCount = 0;
    this.totalKeys = (this.currentWorld === 2) ? 5 : 3;
    this.ui.setWorld(this.currentWorld);
    this.ui.updateKeys(this.collectedKeys);

    // Determine maze size by difficulty
    let mazeDimension;
    if (this.currentWorld === 2) {
      // World 2: Larger and more winding
      mazeDimension = 25;
      if (this.ui.selectedDifficulty === 'easy') mazeDimension = 21;
      if (this.ui.selectedDifficulty === 'hard') mazeDimension = 29;
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
    const spawnX = (this.gameMode === 'coop') ? this.maze.spawnPos.x - 1.2 : this.maze.spawnPos.x;
    this.player.resetPosition(new THREE.Vector3(spawnX, this.maze.spawnPos.y, this.maze.spawnPos.z));

    // Spawn Monsters: World 1 has 1 Dread Walker; World 2 has 2 Abyssal Stalkers (Alpha & Beta)!
    const monsterCount = (this.currentWorld === 2) ? 2 : 1;
    this.monsters = [];

    for (let i = 0; i < monsterCount; i++) {
      const monster = new Monster(this.scene, this.maze, this.sound, this.currentWorld === 2, i);

      // Adjust monster difficulty
      if (this.currentWorld === 2) {
        // World 2: Abyssal Stalkers are aggressive and faster than player's 4.4 walkSpeed!
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

    if (this.gameMode === 'coop') {
      const remoteX = this.maze.spawnPos.x + 1.2;
      this.remotePlayer = new RemotePlayer(this.scene, this.sound, 'PLAYER 2');
      this.remotePlayer.group.position.set(remoteX, 0, this.maze.spawnPos.z);
      this.remotePlayer.targetPos.set(remoteX, 0, this.maze.spawnPos.z);
      this.ui.showTeammateHUD(true, 'PLAYER 2');

      // Send maze layout and initial monster spawn coordinates to Guest with redundancy
      const coopStartPacket = {
        type: 'START_COOP_GAME',
        worldLevel: this.currentWorld,
        difficulty: this.ui.selectedDifficulty,
        mazeSize: this.maze.size,
        mazeGrid: this.maze.grid,
        keyPositions: this.maze.keyPositions.map(k => ({
          id: k.id,
          name: k.name,
          color: k.color,
          grid: k.grid,
          wallDir: k.wallDir,
          pos: { x: k.pos.x, y: k.pos.y, z: k.pos.z }
        })),
        exitPos: { x: this.maze.exitPos.x, y: this.maze.exitPos.y, z: this.maze.exitPos.z },
        spawnPos: { x: this.maze.spawnPos.x, y: this.maze.spawnPos.y, z: this.maze.spawnPos.z },
        monsterSpawns: this.monsters.map((m, idx) => ({
          id: idx,
          variant: m.variant,
          x: m.group.position.x,
          y: m.group.position.y,
          z: m.group.position.z,
          rotY: m.group.rotation.y,
          state: m.state
        }))
      };

      this.network.send(coopStartPacket);
      setTimeout(() => this.network.send(coopStartPacket), 250);
      setTimeout(() => this.network.send(coopStartPacket), 600);
    } else {
      this.ui.showTeammateHUD(false);
    }

    // Hide modals and show HUD
    this.ui.titleScreen.style.display = 'none';
    this.ui.gameoverScreen.style.display = 'none';
    this.ui.victoryScreen.style.display = 'none';
    this.ui.pauseScreen.style.display = 'none';
    this.ui.showHUD();

    if (this.currentWorld === 2) {
      this.ui.notify('⚠️ THE ABYSS: TWO APEX STALKERS ARE HUNTING YOU! (ALPHA & BETA)', 5500);
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

  startCoopGameAsGuest(data) {
    if (!data) return;
    try {
      if (this.state === GAME_STATE.PLAYING && this.hasStartedCoopGame) {
        return;
      }
      this.hasStartedCoopGame = true;

      this.currentWorld = data.worldLevel || 1;
      this.ui.selectedDifficulty = data.difficulty || 'normal';

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

      // Clear previous entities
      if (this.maze) this.scene.remove(this.maze.group);
      if (this.monsters) this.monsters.forEach(m => this.scene.remove(m.group));
      this.monsters = [];
      this.killerMonster = null;
      if (this.exitGate) this.scene.remove(this.exitGate.group);
      this.keys.forEach(k => this.scene.remove(k.group));
      this.keys = [];
      if (this.remotePlayer) {
        this.remotePlayer.destroy();
        this.remotePlayer = null;
      }

      // Reset game state
      this.ui.hideJumpscareOverlay();
      this.player.setDowned(false);
      this.teammateDowned = false;
      this.myDownedTimer = 0;
      this.reviveHoldTimer = 0;
      this.ui.showDownedBanner(false);
      this.ui.showRevivePrompt(false);
      this.collectedKeys = {};
      this.keysCount = 0;
      this.totalKeys = (this.currentWorld === 2) ? 5 : 3;
      this.ui.setWorld(this.currentWorld);
      this.ui.updateKeys(this.collectedKeys);

      // Build Maze from Host's exact grid
      this.maze = new Maze(data.mazeSize, this.currentWorld);
      this.maze.grid = data.mazeGrid;
      this.maze.exitPos = new THREE.Vector3(data.exitPos.x, data.exitPos.y, data.exitPos.z);
      this.maze.spawnPos = new THREE.Vector3(data.spawnPos.x, data.spawnPos.y, data.spawnPos.z);
      this.maze.keyPositions = (data.keyPositions || []).map(info => ({
        id: info.id,
        name: info.name,
        color: info.color,
        grid: info.grid,
        wallDir: info.wallDir,
        pos: new THREE.Vector3(info.pos.x, info.pos.y || 0, info.pos.z)
      }));
      this.maze.build3DWorld(this.scene);

      // Setup Exit Gate
      this.exitGate = new ExitGate(this.maze.exitPos, this.currentWorld);
      this.scene.add(this.exitGate.group);

      // Spawn Keys
      this.keys = this.maze.keyPositions.map(info => {
        const keyItem = new KeyItem(info);
        this.scene.add(keyItem.group);
        return keyItem;
      });

      // Position Guest Player at Spawn
      const guestPos = new THREE.Vector3(data.spawnPos.x + 1.2, this.maze.spawnPos.y, data.spawnPos.z);
      this.player.resetPosition(guestPos);

      // Spawn Host Remote Player
      const hostSpawn = new THREE.Vector3(data.spawnPos.x - 1.2, 0, data.spawnPos.z);
      this.remotePlayer = new RemotePlayer(this.scene, this.sound, 'HOST (P1)');
      this.remotePlayer.group.position.copy(hostSpawn);
      this.remotePlayer.targetPos.copy(hostSpawn);
      this.ui.showTeammateHUD(true, 'HOST (P1)');

      // Visual Monsters (Guest follows Host updates)
      const monsterCount = (this.currentWorld === 2) ? 2 : 1;
      this.monsters = [];
      const spawns = data.monsterSpawns || [];
      for (let i = 0; i < monsterCount; i++) {
        const monster = new Monster(this.scene, this.maze, this.sound, this.currentWorld === 2, i);
        if (spawns[i]) {
          monster.group.position.set(spawns[i].x, spawns[i].y, spawns[i].z);
          monster.group.rotation.y = spawns[i].rotY || 0;
          monster.targetPos = new THREE.Vector3(spawns[i].x, spawns[i].y, spawns[i].z);
          monster.targetRotY = spawns[i].rotY || 0;
          monster.state = spawns[i].state || MONSTER_STATE.PATROL;
        }
        this.monsters.push(monster);
      }

      // Hide modals and show HUD
      this.ui.titleScreen.style.display = 'none';
      this.ui.gameoverScreen.style.display = 'none';
      this.ui.victoryScreen.style.display = 'none';
      this.ui.pauseScreen.style.display = 'none';
      this.ui.showHUD();

      this.sound.resume();
      this.ui.notify('CO-OP EXPEDITION LAUNCHED! Stay close and find all keys!', 5000);

      this.lastFrameTime = performance.now();
      this.gameTotalTime = 0;
      this.elapsedTime = 0;
      this.state = GAME_STATE.PLAYING;

      try {
        this.player.controls.lock();
      } catch (e) {
        console.log('[PointerLock] Awaiting user click to lock pointer');
      }
    } catch (err) {
      console.error('[Co-op] Failed to start game as guest:', err);
      this.ui.notify('Error starting co-op: ' + err.message, 5000);
    }
  }

  spawnMonsterFarAway(monster) {
    // Find an open walkable spot in the maze distant from player spawn and any already-spawned monster
    let bestDist = 0;
    let bestPos = new THREE.Vector3();
    const s = this.maze.size;
    const midX = Math.floor(s / 2);

    for (let attempts = 0; attempts < 80; attempts++) {
      let minGx = 1, maxGx = s - 2;
      // In World 2, separate initial monster spawns into West and East wings of the maze
      if (this.currentWorld === 2 && this.monsters.length > 1) {
        if (monster.variant === 0) {
          maxGx = midX; // West half
        } else if (monster.variant === 1) {
          minGx = midX; // East half
        }
      }

      const gx = minGx + Math.floor(Math.random() * (maxGx - minGx + 1));
      const gz = 1 + Math.floor(Math.random() * (s - 2));

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

        const score = distToSpawn * 0.8 + Math.min(distToOtherMonsters, 50) * 1.5;
        if (score > bestDist) {
          bestDist = score;
          bestPos.copy(wPos);
        }
      }
    }
    monster.spawn(bestPos);
  }

  triggerSonarPulse() {
    const monsterData = this.monsters.map((m, idx) => ({
      pos: m.group.position,
      variant: m.variant,
      name: m.name,
      state: m.state
    }));
    const teammatePos = (this.gameMode === 'coop' && this.remotePlayer)
      ? this.remotePlayer.group.position
      : null;
    const success = this.ui.triggerSonar(
      this.maze,
      this.player.camera.position,
      this.getPlayerYaw(),
      monsterData,
      this.keys,
      teammatePos
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
    let closeMonsterCount = 0;

    if (this.gameMode === 'coop' && !this.isCoopHost) {
      // Guest: Smoothly interpolate monster movements from Host's network synchronization
      for (const monster of this.monsters) {
        monster.updateAsRemote(delta, this.camera, playerPos);

        const dist = Math.hypot(
          monster.group.position.x - playerPos.x,
          monster.group.position.z - playerPos.z
        );

        if (dist < nearestMonsterDist) nearestMonsterDist = dist;
        if (dist < 22) closeMonsterCount++;
        if (monster.state === MONSTER_STATE.CHASE) anyMonsterChasing = true;
        if (monster.state === MONSTER_STATE.INVESTIGATE) anyMonsterInvestigating = true;

        if (dist < 1.95 && !caughtByMonster && !this.player.isDowned) {
          caughtByMonster = monster;
        }
      }
    } else {
      // Solo or Host: Run authoritative AI simulation
      for (const monster of this.monsters) {
        const isLightingLocal = this.player.isLightingObject(monster.group.position);
        const isLightingRemote = (this.remotePlayer && this.remotePlayer.flashlightOn)
          ? this.remotePlayer.isLightingObject(monster.group.position)
          : false;

        monster.update(delta, playerPos, playerNoise, (isLightingLocal || isLightingRemote), this.camera);

        const dist = Math.hypot(
          monster.group.position.x - playerPos.x,
          monster.group.position.z - playerPos.z
        );

        if (dist < nearestMonsterDist) nearestMonsterDist = dist;
        if (dist < 22) closeMonsterCount++;
        if (monster.state === MONSTER_STATE.CHASE) anyMonsterChasing = true;
        if (monster.state === MONSTER_STATE.INVESTIGATE) anyMonsterInvestigating = true;

        if (dist < 1.95 && !caughtByMonster && !this.player.isDowned) {
          caughtByMonster = monster;
        }
      }

      // Soft monster-monster physical repulsion in World 2 so they never overlap/merge
      if (this.monsters.length > 1) {
        for (let i = 0; i < this.monsters.length; i++) {
          for (let j = i + 1; j < this.monsters.length; j++) {
            const m1 = this.monsters[i];
            const m2 = this.monsters[j];
            const dx = m2.group.position.x - m1.group.position.x;
            const dz = m2.group.position.z - m1.group.position.z;
            const dist = Math.hypot(dx, dz);
            const minDist = 2.4;
            if (dist < minDist && dist > 0.001) {
              const overlap = (minDist - dist) * 0.5;
              const nx = dx / dist;
              const nz = dz / dist;
              m1.group.position.x -= nx * overlap;
              m1.group.position.z -= nz * overlap;
              m2.group.position.x += nx * overlap;
              m2.group.position.z += nz * overlap;
              this.maze.resolveCollision(m1.group.position, 0.65);
              this.maze.resolveCollision(m2.group.position, 0.65);
            }
          }
        }
      }
    }

    // Subtle physical ground rumble when heavy monster is stomping nearby
    if (nearestMonsterDist < 12 && (anyMonsterChasing || anyMonsterInvestigating)) {
      const rumble = (1 - nearestMonsterDist / 12) * 0.016;
      this.camera.position.y += (Math.random() - 0.5) * rumble;
    }

    // Update Threat & Heartbeat based on nearest monster and multi-monster presence
    const threat = this.ui.updateThreat(nearestMonsterDist, anyMonsterChasing, this.monsters.length, closeMonsterCount > 1);
    this.sound.setThreatLevel(threat);

    // Update UI HUD
    this.ui.updateBars(
      (this.player.stamina / this.player.maxStamina) * 100,
      this.player.isExhausted,
      this.player.battery
    );
    // Update Compass with directional key markers, exit marker, and teammate marker
    const teammatePos = (this.gameMode === 'coop' && this.remotePlayer)
      ? this.remotePlayer.group.position
      : null;
    this.ui.updateCompass(this.getPlayerYaw(), playerPos, this.keys, this.exitGate, teammatePos);

    // Update Sonar Radar with all monster data & teammate
    const monsterData = this.monsters.map((m, idx) => ({
      pos: m.group.position,
      variant: m.variant,
      name: m.name,
      state: m.state
    }));
    this.ui.updateSonar(
      delta,
      this.maze,
      playerPos,
      this.getPlayerYaw(),
      monsterData,
      this.keys,
      teammatePos
    );

    // Network synchronization in Co-op mode
    if (this.gameMode === 'coop' && this.network.isConnected) {
      this.networkSendTimer += delta;
      if (this.networkSendTimer >= 0.033) {
        this.networkSendTimer = 0;
        const pCam = this.player.camera;
        this.network.send({
          type: 'PLAYER_MOVE',
          x: pCam.position.x,
          y: pCam.position.y,
          z: pCam.position.z,
          yaw: this.getPlayerYaw(),
          pitch: pCam.rotation.x,
          isSprinting: this.player.isSprinting,
          flashlightOn: this.player.flashlightOn,
          battery: this.player.battery,
          isDowned: this.player.isDowned
        });

        // Host synchronizes monster states
        if (this.isCoopHost && this.monsters.length > 0) {
          const monsterSyncData = this.monsters.map((m, idx) => ({
            id: idx,
            variant: m.variant,
            x: m.group.position.x,
            y: m.group.position.y,
            z: m.group.position.z,
            rotY: m.group.rotation.y,
            state: m.state
          }));
          this.network.send({ type: 'MONSTER_SYNC', monsters: monsterSyncData });
        }
      }

      // Update Remote Player
      if (this.remotePlayer) {
        this.remotePlayer.update(delta, playerPos);
        const distToTm = this.remotePlayer.group.position.distanceTo(playerPos);
        this.ui.updateTeammateHUD(this.teammateDowned, distToTm);

        // Reviving Teammate Check
        if (this.teammateDowned && !this.player.isDowned) {
          if (distToTm < 2.8) {
            this.reviveHoldTimer += delta;
            this.ui.showRevivePrompt(true, Math.max(0, 3.0 - this.reviveHoldTimer));
            if (this.reviveHoldTimer >= 3.0) {
              this.reviveHoldTimer = 0;
              this.teammateDowned = false;
              this.remotePlayer.setDowned(false);
              this.sound.playReviveSound();
              this.network.send({ type: 'REVIVE_TEAMMATE' });
              this.ui.showRevivePrompt(false);
              this.ui.notify('You revived your teammate!', 3500);
            }
          } else {
            this.reviveHoldTimer = 0;
            this.ui.showRevivePrompt(false);
          }
        } else {
          this.reviveHoldTimer = 0;
          this.ui.showRevivePrompt(false);
        }
      }

      // Local player Downed Bleed-out Countdown
      if (this.player.isDowned) {
        this.myDownedTimer -= delta;
        this.ui.showDownedBanner(true, this.myDownedTimer);
        if (this.myDownedTimer <= 0) {
          this.network.send({ type: 'COOP_GAMEOVER' });
          this.state = GAME_STATE.GAMEOVER;
          this.ui.hideHUD();
          this.ui.showGameOver(this.elapsedTime, this.keysCount, this.totalKeys, this.currentWorld);
        }
      } else {
        this.ui.showDownedBanner(false);
      }
    }

    // Catch / Jumpscare check
    if (caughtByMonster && !this.player.isDowned) {
      this.triggerGameOverCatch(caughtByMonster);
    }
  }

  updateKeys(time, playerPos) {
    let nearInteractable = false;
    let nearestKeyDist = Infinity;

    for (const key of this.keys) {
      key.update(time);

      if (!key.collected) {
        const horizDist = Math.hypot(key.group.position.x - playerPos.x, key.group.position.z - playerPos.z);
        if (horizDist < nearestKeyDist) {
          nearestKeyDist = horizDist;
        }

        // Check if looking near key
        if (horizDist < 3.8) {
          nearInteractable = true;
        }

        // Collect key
        if (horizDist < 2.2) {
          key.collected = true;
          this.scene.remove(key.group);

          this.collectedKeys[key.id] = true;
          this.keysCount++;

          this.sound.playKeyPickup();
          this.ui.updateKeys(this.collectedKeys);
          this.exitGate.insertKey(key.id);

          this.ui.notify(`Acquired ${key.name} (${this.keysCount}/${this.totalKeys})!`);

          if (this.gameMode === 'coop') {
            this.network.send({ type: 'KEY_COLLECTED', keyId: key.id });
          }

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

    // 3. Complete kill & transition to Game Over or Co-op Downed
    if (progress >= 1.0) {
      this.ui.hideJumpscareOverlay();

      if (this.gameMode === 'coop' && this.remotePlayer && !this.teammateDowned) {
        // Co-op: enter downed state instead of game over, allowing teammate to revive!
        this.state = GAME_STATE.PLAYING;
        this.ui.showHUD();
        this.player.setDowned(true);
        this.myDownedTimer = 35;
        this.sound.playTeammateDowned();

        // Broadcast to teammate that we are downed
        this.network.send({
          type: 'DOWNED_ALERT',
          position: [this.player.camera.position.x, 0, this.player.camera.position.z]
        });

        // Repel the monster so it doesn't continuously body-block the downed player
        if (monster && monster.group) {
          monster.state = MONSTER_STATE.PATROL;
          monster.speed = monster.patrolSpeed || monster.baseSpeed || 1.8;
          const away = new THREE.Vector3().subVectors(monster.group.position, this.camera.position).normalize();
          if (away.lengthSq() < 0.01) away.set(1, 0, 0);
          monster.group.position.addScaledVector(away, 14.0);
        }

        this.ui.notify('⚠️ YOU ARE DOWNED! Bleeding out in 35s... Wait for teammate revive!', 5000);
      } else {
        this.state = GAME_STATE.GAMEOVER;
        this.ui.showGameOver(this.elapsedTime, this.keysCount, this.totalKeys, this.currentWorld, this.killerMonster ? this.killerMonster.name : null);
        if (this.gameMode === 'coop') {
          this.network.send({ type: 'COOP_GAMEOVER' });
        }
      }
    }
  }

  triggerVictory() {
    if (this.state === GAME_STATE.VICTORY) return;
    this.state = GAME_STATE.VICTORY;
    this.player.controls.unlock();
    this.sound.playVictory();

    if (this.gameMode === 'coop') {
      this.network.send({ type: 'COOP_VICTORY' });
    }

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
