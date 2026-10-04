export class UIController {
  constructor() {
    // Overlays
    this.dangerOverlay = document.getElementById('danger-overlay');
    this.crosshair = document.getElementById('crosshair');
    this.hud = document.getElementById('hud');

    // Compass
    this.compassTape = document.getElementById('compass-tape');

    // Key Slots
    this.slotRuby = document.getElementById('slot-ruby');
    this.slotSapphire = document.getElementById('slot-sapphire');
    this.slotTopaz = document.getElementById('slot-topaz');

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

  showGameOver(timeSurvived, keysFound) {
    this.hideHUD();
    this.statsTimeDead.textContent = this.formatTime(timeSurvived);
    this.statsKeysDead.textContent = `${keysFound} / 3`;
    this.gameoverScreen.style.display = 'flex';
  }

  showVictory(timeElapsed) {
    this.hideHUD();
    this.statsTimeWin.textContent = this.formatTime(timeElapsed);

    let rating = 'S RANK';
    if (timeElapsed > 240) rating = 'B RANK';
    else if (timeElapsed > 150) rating = 'A RANK';
    this.statsRating.textContent = rating;

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

  updateCompass(yawRadians) {
    // Convert yaw to 0..360 degrees where 0 = North (-Z), 90 = East (+X)
    let degrees = (yawRadians * (180 / Math.PI)) % 360;
    if (degrees < 0) degrees += 360;

    // 45 deg = 60px span width. Center of first span (N) is at 30px.
    const pxPerDegree = 60 / 45; // 1.3333...
    const offset = -30 - (degrees * pxPerDegree);
    this.compassTape.style.transform = `translateX(${offset}px)`;
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
    if (keys.ruby) this.slotRuby.classList.add('collected', 'ruby');
    else this.slotRuby.classList.remove('collected', 'ruby');

    if (keys.sapphire) this.slotSapphire.classList.add('collected', 'sapphire');
    else this.slotSapphire.classList.remove('collected', 'sapphire');

    if (keys.topaz) this.slotTopaz.classList.add('collected', 'topaz');
    else this.slotTopaz.classList.remove('collected', 'topaz');
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
    this.sonarCooldown = 6.0;
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

    // Generate persistent arterial blood splatters for this kill
    this.bloodSplatters = [];
    const count = 28;
    for (let i = 0; i < count; i++) {
      this.bloodSplatters.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        maxRadius: 18 + Math.random() * 55,
        dripLength: 30 + Math.random() * 120,
        dripSpeed: 40 + Math.random() * 80,
        dripWidth: 2 + Math.random() * 4,
        appearTime: 0.15 + Math.random() * 0.45,
        droplets: Array.from({ length: 4 }, () => ({
          ox: (Math.random() - 0.5) * 40,
          oy: (Math.random() - 0.5) * 40,
          rad: 2 + Math.random() * 6
        }))
      });
    }

    // 3 Claw slash trajectories across camera lens
    this.clawSlashes = [
      { x1: canvas.width * 0.15, y1: canvas.height * 0.1, x2: canvas.width * 0.45, y2: canvas.height * 0.85 },
      { x1: canvas.width * 0.25, y1: canvas.height * 0.05, x2: canvas.width * 0.55, y2: canvas.height * 0.9 },
      { x1: canvas.width * 0.35, y1: canvas.height * 0.08, x2: canvas.width * 0.65, y2: canvas.height * 0.88 }
    ];
  }

  renderJumpscareGore(progress) {
    if (!this.jumpscareCtx) return;
    const ctx = this.jumpscareCtx;
    const canvas = this.jumpscareCanvas;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Initial shock flash & chromatic trauma
    if (progress < 0.2) {
      const flashAlpha = (1 - progress / 0.2) * 0.45;
      ctx.fillStyle = `rgba(220, 10, 20, ${flashAlpha})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Claw slash gouges across lens
    if (progress > 0.15) {
      const slashProgress = Math.min(1.0, (progress - 0.15) / 0.25);
      ctx.strokeStyle = 'rgba(180, 10, 15, 0.85)';
      ctx.lineWidth = 4;
      ctx.shadowColor = 'rgba(120, 0, 0, 0.9)';
      ctx.shadowBlur = 10;

      for (const slash of this.clawSlashes) {
        ctx.beginPath();
        ctx.moveTo(slash.x1, slash.y1);
        const currX = THREE.MathUtils.lerp(slash.x1, slash.x2, slashProgress);
        const currY = THREE.MathUtils.lerp(slash.y1, slash.y2, slashProgress);
        ctx.lineTo(currX, currY);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    // Arterial Blood Splatters bursting onto the lens & dripping down
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

    // Red horror vignette tightening around screen
    if (progress > 0.3) {
      const vProg = (progress - 0.3) / 0.7;
      const vGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.65);
      vGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vGrad.addColorStop(1, `rgba(90, 0, 10, ${Math.min(0.85, vProg * 1.1)})`);
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, 0, w, h);
    }

    // Final Blackout Fade to Dead
    if (progress > 0.72) {
      const blackAlpha = Math.min(1.0, (progress - 0.72) / 0.28);
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
