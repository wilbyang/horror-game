import * as THREE from 'three';

export class UIController {
  constructor() {
    // Overlays
    this.dangerOverlay = document.getElementById('danger-overlay');
    this.crosshair = document.getElementById('crosshair');
    this.hud = document.getElementById('hud');
    this.worldBadge = document.getElementById('world-badge');

    // Compass
    this.compassTape = document.getElementById('compass-tape');
    this.compassMarkersContainer = document.getElementById('compass-key-markers');

    // Key Slots (Generic for World 1 & 2)
    this.keySlots = [
      document.getElementById('slot-key-0'),
      document.getElementById('slot-key-1'),
      document.getElementById('slot-key-2')
    ];
    this.keyLabels = [
      document.getElementById('slot-key-label-0'),
      document.getElementById('slot-key-label-1'),
      document.getElementById('slot-key-label-2')
    ];
    this.keyIds = ['ruby', 'sapphire', 'topaz'];

    // Status bars
    this.staminaFill = document.getElementById('stamina-fill');
    this.batteryFill = document.getElementById('battery-fill');

    // Threat indicator
    this.heartIcon = document.getElementById('heart-icon');
    this.threatText = document.getElementById('threat-text');

    // Toast notification
    this.notificationBox = document.getElementById('notification-box');
    this.notifyTimeout = null;

    // Sonar radar
    this.sonarWrapper = document.getElementById('sonar-canvas-wrapper');
    this.sonarCanvas = document.getElementById('sonar-canvas');
    this.sonarCtx = this.sonarCanvas ? this.sonarCanvas.getContext('2d') : null;
    this.sonarActive = false;
    this.sonarTimer = 0;
    this.sonarCooldown = 0;

    // Modals
    this.titleScreen = document.getElementById('title-screen');
    this.gameoverScreen = document.getElementById('gameover-screen');
    this.victoryScreen = document.getElementById('victory-screen');
    this.pauseScreen = document.getElementById('pause-screen');

    // Title screen elements
    this.btnWorld1 = document.getElementById('btn-world-1');
    this.btnWorld2 = document.getElementById('btn-world-2');
    this.w2CardTitle = document.getElementById('w2-card-title');
    this.w2CardSub = document.getElementById('w2-card-sub');
    this.titleMainHeader = document.getElementById('title-main-header');
    this.titleSubHeader = document.getElementById('title-sub-header');
    this.titleStoryCard = document.getElementById('title-story-card');
    this.startBtn = document.getElementById('start-btn');

    // Victory screen elements
    this.btnEnterWorld2 = document.getElementById('btn-enter-world2');
    this.playagainBtn = document.getElementById('playagain-btn');
    this.victoryMenuBtn = document.getElementById('victory-menu-btn');
    this.victoryTitle = document.getElementById('victory-title');
    this.victorySubtitle = document.getElementById('victory-subtitle');
    this.deathReason = document.getElementById('death-reason');

    // Stats elements
    this.statsTimeDead = document.getElementById('stats-time-dead');
    this.statsKeysDead = document.getElementById('stats-keys-dead');
    this.statsTimeWin = document.getElementById('stats-time-win');
    this.statsRating = document.getElementById('stats-rating');

    // Jumpscare
    this.jumpscareOverlay = document.getElementById('jumpscare-overlay');
    this.jumpscareCanvas = document.getElementById('jumpscare-canvas');
    this.jumpscareCtx = this.jumpscareCanvas ? this.jumpscareCanvas.getContext('2d') : null;

    this.selectedDifficulty = 'normal';
    this.selectedWorld = 1;
    this.isWorld2Unlocked = false;

    this.setupDifficultyButtons();
  }

  setupDifficultyButtons() {
    const diffButtons = document.querySelectorAll('.diff-btn');
    diffButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        diffButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedDifficulty = btn.dataset.diff;
      });
    });
  }

  setupWorldButtons(onWorldChange) {
    if (this.btnWorld1 && this.btnWorld2) {
      this.btnWorld1.addEventListener('click', () => {
        this.selectWorld(1, onWorldChange);
      });

      this.btnWorld2.addEventListener('click', () => {
        if (this.isWorld2Unlocked) {
          this.selectWorld(2, onWorldChange);
        } else {
          this.notify('Survive World 1 to unlock The Abyssal Crypt!', 3000);
        }
      });
    }
  }

  updateWorldUnlockState(unlocked) {
    this.isWorld2Unlocked = unlocked;
    if (this.btnWorld2) {
      if (unlocked) {
        this.btnWorld2.classList.remove('locked');
        if (this.w2CardTitle) this.w2CardTitle.textContent = 'WORLD 2';
        if (this.w2CardSub) this.w2CardSub.textContent = 'THE ABYSSAL CRYPT';
      } else {
        this.btnWorld2.classList.add('locked');
        if (this.w2CardTitle) this.w2CardTitle.textContent = 'WORLD 2 🔒';
        if (this.w2CardSub) this.w2CardSub.textContent = 'THE ABYSSAL CRYPT';
      }
    }
  }

  selectWorld(worldLevel, callback) {
    this.selectedWorld = worldLevel;
    if (this.btnWorld1) {
      if (worldLevel === 1) this.btnWorld1.classList.add('active');
      else this.btnWorld1.classList.remove('active');
    }
    if (this.btnWorld2) {
      if (worldLevel === 2) this.btnWorld2.classList.add('active');
      else this.btnWorld2.classList.remove('active');
    }

    if (worldLevel === 2) {
      if (this.titleMainHeader) this.titleMainHeader.textContent = 'THE ABYSSAL CRYPT';
      if (this.titleSubHeader) this.titleSubHeader.textContent = 'LAIR OF THE ABYSSAL STALKER';
      if (this.titleStoryCard) {
        this.titleStoryCard.innerHTML = `
          You have breached the iron gate and descended into the abyssal underworld.<br>
          Obsidian fissures glow with molten lava, and blood-mist fills the chambers.<br><br>
          <strong>OBJECTIVE:</strong> Recover <strong>3 Abyssal Relics</strong> and find the <strong>Void Portal</strong>.<br>
          <strong style="color:#f43f5e;">THREAT:</strong> The Abyssal Stalker is <em>FASTER THAN YOUR NORMAL WALK SPEED</em> and highly resistant to light stuns!
          <div class="key-objective-preview" id="key-preview-container">
            <div class="key-preview-item" style="color:#c084fc;">◆ Void Amethyst</div>
            <div class="key-preview-item" style="color:#34d399;">◆ Soul Emerald</div>
            <div class="key-preview-item" style="color:#fb7185;">◆ Abyssal Eye</div>
          </div>
        `;
      }
      if (this.startBtn) this.startBtn.textContent = 'ENTER THE ABYSS';
    } else {
      if (this.titleMainHeader) this.titleMainHeader.textContent = 'LABYRINTH';
      if (this.titleSubHeader) this.titleSubHeader.textContent = 'OF THE DREAD WALKER';
      if (this.titleStoryCard) {
        this.titleStoryCard.innerHTML = `
          You are trapped in a sprawling subterranean labyrinth.
          An eldritch stalker wanders these damp stone halls, hunting in the dark.<br><br>
          <strong>OBJECTIVE:</strong> Search the deep chambers to locate all <strong>3 Ancient Keys</strong>,
          then find the fortified <strong>South Exit Gate</strong> to escape alive.
          <div class="key-objective-preview" id="key-preview-container">
            <div class="key-preview-item" style="color:#f87171;">◆ Ruby Key</div>
            <div class="key-preview-item" style="color:#60a5fa;">◆ Sapphire Key</div>
            <div class="key-preview-item" style="color:#fbbf24;">◆ Topaz Key</div>
          </div>
        `;
      }
      if (this.startBtn) this.startBtn.textContent = 'ENTER THE LABYRINTH';
    }

    if (callback) callback(worldLevel);
  }

  setWorld(worldLevel) {
    this.currentWorld = worldLevel;

    // Reset key slot states
    this.keySlots.forEach(slot => {
      if (slot) slot.className = 'key-slot';
    });

    if (worldLevel === 2) {
      if (this.worldBadge) {
        this.worldBadge.textContent = 'WORLD 2: THE ABYSS';
        this.worldBadge.className = 'world-badge w2';
      }
      if (this.keyLabels[0]) this.keyLabels[0].textContent = 'AMETHYST';
      if (this.keyLabels[1]) this.keyLabels[1].textContent = 'EMERALD';
      if (this.keyLabels[2]) this.keyLabels[2].textContent = 'CRIMSON';
      this.keyIds = ['amethyst', 'emerald', 'crimson'];
    } else {
      if (this.worldBadge) {
        this.worldBadge.textContent = 'WORLD 1: LABYRINTH';
        this.worldBadge.className = 'world-badge';
      }
      if (this.keyLabels[0]) this.keyLabels[0].textContent = 'RUBY';
      if (this.keyLabels[1]) this.keyLabels[1].textContent = 'SAPPHIRE';
      if (this.keyLabels[2]) this.keyLabels[2].textContent = 'TOPAZ';
      this.keyIds = ['ruby', 'sapphire', 'topaz'];
    }
  }

  showHUD() {
    this.hud.style.display = 'block';
  }

  hideHUD() {
    this.hud.style.display = 'none';
  }

  showTitle() {
    this.titleScreen.style.display = 'flex';
    this.gameoverScreen.style.display = 'none';
    this.victoryScreen.style.display = 'none';
    this.pauseScreen.style.display = 'none';
    this.hideHUD();
  }

  showPause() {
    this.pauseScreen.style.display = 'flex';
  }

  hidePause() {
    this.pauseScreen.style.display = 'none';
  }

  showGameOver(timeSurvived, keysFound, worldLevel = 1) {
    this.hideHUD();
    this.statsTimeDead.textContent = this.formatTime(timeSurvived);
    this.statsKeysDead.textContent = `${keysFound} / 3`;
    if (this.deathReason) {
      if (worldLevel === 2) {
        this.deathReason.textContent = 'THE ABYSSAL STALKER SHREDDED YOUR SOUL';
      } else {
        this.deathReason.textContent = 'THE DREAD WALKER CONSUMED YOUR SOUL';
      }
    }
    this.gameoverScreen.style.display = 'flex';
  }

  showVictory(timeElapsed, worldLevel = 1) {
    this.hideHUD();
    this.statsTimeWin.textContent = this.formatTime(timeElapsed);

    let rating = 'S RANK';
    if (timeElapsed > 240) rating = 'B RANK';
    else if (timeElapsed > 150) rating = 'A RANK';
    this.statsRating.textContent = rating;

    if (worldLevel === 1) {
      if (this.victoryTitle) {
        this.victoryTitle.textContent = 'YOU ESCAPED';
        this.victoryTitle.style.color = '#34d399';
        this.victoryTitle.style.textShadow = '0 0 40px #10b981';
      }
      if (this.victorySubtitle) {
        this.victorySubtitle.innerHTML = 'YOU UNLOCKED THE GATE AND SURVIVED THE LABYRINTH!<br><span style="color:#c084fc;font-weight:bold;letter-spacing:2px;display:inline-block;margin-top:6px;">WORLD 2: THE ABYSSAL CRYPT IS NOW UNLOCKED!</span>';
      }
      if (this.btnEnterWorld2) {
        this.btnEnterWorld2.style.display = 'block';
      }
      if (this.playagainBtn) {
        this.playagainBtn.textContent = 'REPLAY WORLD 1';
      }
    } else {
      if (this.victoryTitle) {
        this.victoryTitle.textContent = 'ABYSS CONQUERED';
        this.victoryTitle.style.color = '#a855f7';
        this.victoryTitle.style.textShadow = '0 0 45px #a855f7';
      }
      if (this.victorySubtitle) {
        this.victorySubtitle.innerHTML = 'YOU DEFEATED THE ABYSSAL STALKER AND ESCAPED THE VOID!<br><span style="color:#34d399;font-weight:bold;letter-spacing:2px;display:inline-block;margin-top:6px;">MASTER SURVIVOR: COMPLETED BOTH WORLDS</span>';
      }
      if (this.btnEnterWorld2) {
        this.btnEnterWorld2.style.display = 'none';
      }
      if (this.playagainBtn) {
        this.playagainBtn.textContent = 'REPLAY WORLD 2';
      }
    }

    this.victoryScreen.style.display = 'flex';
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  notify(msg, duration = 3500) {
    if (this.notifyTimeout) clearTimeout(this.notifyTimeout);
    this.notificationBox.textContent = msg;
    this.notificationBox.classList.add('show');
    this.notifyTimeout = setTimeout(() => {
      this.notificationBox.classList.remove('show');
    }, duration);
  }

  updateCompass(yawRadians, playerPos = null, keys = [], exitGate = null) {
    // Convert yaw to 0..360 degrees where 0 = North (-Z), 90 = East (+X)
    let degrees = (yawRadians * (180 / Math.PI)) % 360;
    if (degrees < 0) degrees += 360;

    // 45 deg = 60px span width. Center of first span (N) is at 30px.
    const pxPerDegree = 60 / 45; // 1.3333...
    const offset = -30 - (degrees * pxPerDegree);
    this.compassTape.style.transform = `translateX(${offset}px)`;

    // Update floating directional key / exit markers on the compass tape
    if (this.compassMarkersContainer && playerPos) {
      let markersHtml = '';

      // Check uncollected keys
      keys.forEach(k => {
        if (!k.collected) {
          const dx = k.pos.x - playerPos.x;
          const dz = k.pos.z - playerPos.z;
          const keyAngle = Math.atan2(dx, -dz);
          let diff = keyAngle - yawRadians;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;

          const pxOffset = diff * (180 / Math.PI) * pxPerDegree;
          if (Math.abs(pxOffset) < 125) {
            const hex = '#' + k.colorHex.toString(16).padStart(6, '0');
            const label = k.id.toUpperCase();
            markersHtml += `<div class="compass-key-marker" style="left: calc(50% + ${pxOffset}px); color: ${hex}; border-color: ${hex};">◆ ${label}</div>`;
          }
        }
      });

      // If all keys collected, point to Exit Gate / Void Portal
      const allCollected = keys.length > 0 && keys.every(k => k.collected);
      if (allCollected && exitGate) {
        const dx = exitGate.pos.x - playerPos.x;
        const dz = exitGate.pos.z - playerPos.z;
        const exitAngle = Math.atan2(dx, -dz);
        let diff = exitAngle - yawRadians;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        const pxOffset = diff * (180 / Math.PI) * pxPerDegree;
        if (Math.abs(pxOffset) < 125) {
          const exitColor = (exitGate.worldLevel === 2) ? '#a855f7' : '#10b981';
          const exitLabel = (exitGate.worldLevel === 2) ? '★ VOID PORTAL' : '★ EXIT';
          markersHtml += `<div class="compass-key-marker" style="left: calc(50% + ${pxOffset}px); color: ${exitColor}; border-color: ${exitColor};">${exitLabel}</div>`;
        }
      }

      this.compassMarkersContainer.innerHTML = markersHtml;
    }
  }

  updateBars(staminaPercent, isExhausted, batteryPercent) {
    this.staminaFill.style.width = `${staminaPercent}%`;
    if (isExhausted) {
      this.staminaFill.classList.add('exhausted');
    } else {
      this.staminaFill.classList.remove('exhausted');
    }

    this.batteryFill.style.width = `${batteryPercent}%`;
  }

  updateKeys(keys) {
    if (!this.keyIds) return;
    this.keyIds.forEach((id, idx) => {
      const slot = this.keySlots[idx];
      if (slot) {
        if (keys[id]) {
          slot.className = `key-slot collected ${id}`;
        } else {
          slot.className = 'key-slot';
        }
      }
    });
  }

  updateThreat(distance, isChasing) {
    let threat = 0;
    let label = 'CLEAR';

    if (distance < 38) {
      threat = (38 - distance) / 38;
      if (distance < 12 || isChasing) {
        label = 'RUN!';
        this.heartIcon.setAttribute('class', 'danger');
      } else if (distance < 22) {
        label = 'WARNING';
        this.heartIcon.setAttribute('class', 'beating');
      } else {
        label = 'CAUTION';
        this.heartIcon.setAttribute('class', 'beating');
      }
    } else {
      this.heartIcon.setAttribute('class', '');
    }

    this.threatText.textContent = label;

    // Red horror vignette opacity
    if (isChasing) {
      this.dangerOverlay.style.opacity = '0.9';
    } else {
      this.dangerOverlay.style.opacity = `${threat * 0.75}`;
    }

    return threat;
  }

  // Trigger Echolocation Pulse
  triggerSonar(maze, playerPos, playerYaw, monsterPos, keys) {
    if (this.sonarCooldown > 0) return false;

    this.sonarActive = true;
    this.sonarTimer = 2.8;
    this.sonarCooldown = 3.0;
    this.sonarWrapper.style.display = 'flex';
    return true;
  }

  updateSonar(delta, maze, playerPos, playerYaw, monsterPos, keys) {
    if (this.sonarCooldown > 0) {
      this.sonarCooldown -= delta;
    }

    if (!this.sonarActive) return;

    this.sonarTimer -= delta;
    if (this.sonarTimer <= 0) {
      this.sonarActive = false;
      this.sonarWrapper.style.display = 'none';
      return;
    }

    if (!this.sonarCtx) return;

    const ctx = this.sonarCtx;
    const w = this.sonarCanvas.width;
    const h = this.sonarCanvas.height;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Sonar grid background
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.25)';
    ctx.lineWidth = 1;

    for (let r = 40; r <= 180; r += 45) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Rotating scan sweep
    const sweepAngle = (2.8 - this.sonarTimer) * 4.5;
    const grad = ctx.createConicGradient(sweepAngle, cx, cy);
    grad.addColorStop(0, 'rgba(16, 185, 129, 0.45)');
    grad.addColorStop(0.12, 'rgba(16, 185, 129, 0.0)');
    grad.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 185, 0, Math.PI * 2);
    ctx.fill();

    // Draw nearby maze walls on sonar
    const playerG = maze.worldToGrid(playerPos.x, playerPos.z);
    const range = 9; // cells
    const scale = 14;

    ctx.fillStyle = 'rgba(16, 185, 129, 0.55)';
    for (let dz = -range; dz <= range; dz++) {
      for (let dx = -range; dx <= range; dx++) {
        const gx = playerG.x + dx;
        const gz = playerG.z + dz;

        if (gx >= 0 && gx < maze.size && gz >= 0 && gz < maze.size && maze.grid[gz][gx] === 1) {
          const rx = cx + dx * scale;
          const ry = cy + dz * scale;
          const distFromCenter = Math.hypot(rx - cx, ry - cy);
          if (distFromCenter < 180) {
            ctx.fillRect(rx - scale / 2 + 1, ry - scale / 2 + 1, scale - 2, scale - 2);
          }
        }
      }
    }

    // Draw Player marker
    ctx.fillStyle = '#34d399';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();

    // Player heading arrow
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(playerYaw) * 16, cy - Math.cos(playerYaw) * 16);
    ctx.stroke();

    // Draw Monster ping
    const mDx = (monsterPos.x - playerPos.x) / 4.0;
    const mDz = (monsterPos.z - playerPos.z) / 4.0;
    const mx = cx + mDx * scale;
    const my = cy + mDz * scale;
    const mDist = Math.hypot(mx - cx, my - cy);

    if (mDist < 185) {
      // Flashing red monster blip
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(mx, my, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Draw Keys on sonar
    keys.forEach(k => {
      if (!k.collected) {
        const kDx = (k.pos.x - playerPos.x) / 4.0;
        const kDz = (k.pos.z - playerPos.z) / 4.0;
        const kx = cx + kDx * scale;
        const ky = cy + kDz * scale;
        if (Math.hypot(kx - cx, ky - cy) < 185) {
          ctx.fillStyle = '#' + k.colorHex.toString(16).padStart(6, '0');
          ctx.beginPath();
          ctx.arc(kx, ky, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }

  // Jumpscare Gore Overlay
  startJumpscareOverlay() {
    this.jumpscareOverlay.style.display = 'block';
    const canvas = this.jumpscareCanvas;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Generate persistent arterial blood splatters framing the screen perimeter
    this.bloodSplatters = [];
    const count = 30;
    for (let i = 0; i < count; i++) {
      let sx, sy;
      // 85% of splatters hit the outer edges to keep the center completely clear for the monster's head
      if (Math.random() < 0.85) {
        const edge = Math.floor(Math.random() * 4);
        if (edge === 0) { sx = Math.random() * canvas.width; sy = Math.random() * canvas.height * 0.22; }
        else if (edge === 1) { sx = Math.random() * canvas.width; sy = canvas.height * 0.78 + Math.random() * canvas.height * 0.22; }
        else if (edge === 2) { sx = Math.random() * canvas.width * 0.22; sy = Math.random() * canvas.height; }
        else { sx = canvas.width * 0.78 + Math.random() * canvas.width * 0.22; sy = Math.random() * canvas.height; }
      } else {
        sx = Math.random() * canvas.width;
        sy = Math.random() * canvas.height;
      }

      this.bloodSplatters.push({
        x: sx,
        y: sy,
        maxRadius: 16 + Math.random() * 45,
        dripLength: 25 + Math.random() * 110,
        dripSpeed: 40 + Math.random() * 80,
        dripWidth: 2 + Math.random() * 4,
        appearTime: 0.25 + Math.random() * 0.45,
        droplets: Array.from({ length: 4 }, () => ({
          ox: (Math.random() - 0.5) * 35,
          oy: (Math.random() - 0.5) * 35,
          rad: 2 + Math.random() * 5
        }))
      });
    }

    // 3 Claw slash trajectories across outer edges of camera lens
    this.clawSlashes = [
      { x1: canvas.width * 0.1, y1: canvas.height * 0.15, x2: canvas.width * 0.38, y2: canvas.height * 0.88 },
      { x1: canvas.width * 0.2, y1: canvas.height * 0.08, x2: canvas.width * 0.48, y2: canvas.height * 0.92 },
      { x1: canvas.width * 0.62, y1: canvas.height * 0.1, x2: canvas.width * 0.9, y2: canvas.height * 0.86 }
    ];
  }

  renderJumpscareGore(progress) {
    if (!this.jumpscareCtx) return;
    const ctx = this.jumpscareCtx;
    const canvas = this.jumpscareCanvas;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Initial shock radial flash (edges flash red, center remains crystal clear for the face)
    if (progress < 0.22) {
      const flashAlpha = (1 - progress / 0.22) * 0.45;
      const fGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.75);
      fGrad.addColorStop(0, 'rgba(220, 10, 20, 0)');
      fGrad.addColorStop(1, `rgba(220, 10, 20, ${flashAlpha})`);
      ctx.fillStyle = fGrad;
      ctx.fillRect(0, 0, w, h);
    }

    // Claw slash gouges across lens
    if (progress > 0.2) {
      const slashProgress = Math.min(1.0, (progress - 0.2) / 0.25);
      ctx.strokeStyle = 'rgba(180, 10, 15, 0.85)';
      ctx.lineWidth = 4;
      ctx.shadowColor = 'rgba(120, 0, 0, 0.9)';
      ctx.shadowBlur = 10;

      for (const slash of this.clawSlashes) {
        ctx.beginPath();
        ctx.moveTo(slash.x1, slash.y1);
        const currX = slash.x1 + (slash.x2 - slash.x1) * slashProgress;
        const currY = slash.y1 + (slash.y2 - slash.y1) * slashProgress;
        ctx.lineTo(currX, currY);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    // Arterial Blood Splatters bursting onto perimeter of lens & dripping down
    for (const s of this.bloodSplatters) {
      if (progress >= s.appearTime) {
        const localProg = (progress - s.appearTime) / (1 - s.appearTime);
        const curRadius = Math.min(s.maxRadius, s.maxRadius * (localProg * 3));

        // Core splatter
        ctx.fillStyle = 'rgba(120, 8, 14, 0.9)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, curRadius, 0, Math.PI * 2);
        ctx.fill();

        // Surrounding droplet bursts
        ctx.fillStyle = 'rgba(140, 10, 16, 0.85)';
        for (const drop of s.droplets) {
          ctx.beginPath();
          ctx.arc(s.x + drop.ox, s.y + drop.oy, drop.rad, 0, Math.PI * 2);
          ctx.fill();
        }

        // Dripping blood trails
        if (localProg > 0.2) {
          const dripProg = (localProg - 0.2) / 0.8;
          const currentDrip = s.dripLength * dripProg;
          ctx.fillStyle = 'rgba(110, 6, 10, 0.88)';
          ctx.fillRect(s.x - s.dripWidth / 2, s.y, s.dripWidth, currentDrip);

          // Teardrop bead at bottom of drip
          ctx.beginPath();
          ctx.arc(s.x, s.y + currentDrip, s.dripWidth * 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Red horror vignette tightening around screen borders (center remains transparent)
    if (progress > 0.35) {
      const vProg = (progress - 0.35) / 0.65;
      const vGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.7);
      vGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vGrad.addColorStop(1, `rgba(90, 0, 10, ${Math.min(0.85, vProg * 1.1)})`);
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, 0, w, h);
    }

    // Final Blackout Fade to Dead during the final lethal strike
    if (progress > 0.82) {
      const blackAlpha = Math.min(1.0, (progress - 0.82) / 0.18);
      ctx.fillStyle = `rgba(3, 2, 4, ${blackAlpha})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  hideJumpscareOverlay() {
    this.jumpscareOverlay.style.display = 'none';
    if (this.jumpscareCtx && this.jumpscareCanvas) {
      this.jumpscareCtx.clearRect(0, 0, this.jumpscareCanvas.width, this.jumpscareCanvas.height);
    }
  }
}
