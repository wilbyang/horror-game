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
        this.heartIcon.className = 'danger';
      } else if (distance < 22) {
        label = 'WARNING';
        this.heartIcon.className = 'beating';
      } else {
        label = 'CAUTION';
        this.heartIcon.className = 'beating';
      }
    } else {
      this.heartIcon.className = '';
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

  // Jumpscare Animation
  playJumpscare(onComplete) {
    this.jumpscareOverlay.style.display = 'block';
    const canvas = this.jumpscareCanvas;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = this.jumpscareCtx;

    let frame = 0;
    const maxFrames = 75;

    const animate = () => {
      frame++;
      ctx.fillStyle = '#050204';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const progress = frame / maxFrames;
      const zoom = 0.5 + progress * 2.5;

      // Draw distorted screaming eldritch skull
      ctx.save();
      ctx.translate(canvas.width / 2 + (Math.random() - 0.5) * 40, canvas.height / 2 + (Math.random() - 0.5) * 40);
      ctx.scale(zoom, zoom);

      // Skull contour
      ctx.fillStyle = '#1e1c1f';
      ctx.beginPath();
      ctx.ellipse(0, -20, 110, 150, 0, 0, Math.PI * 2);
      ctx.fill();

      // Sunken eye sockets
      ctx.fillStyle = '#08080a';
      ctx.beginPath();
      ctx.ellipse(-45, -40, 32, 45, 0.1, 0, Math.PI * 2);
      ctx.ellipse(45, -40, 32, 45, -0.1, 0, Math.PI * 2);
      ctx.fill();

      // Glowing red pupils
      ctx.fillStyle = '#ff0011';
      ctx.shadowColor = '#ff0011';
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.arc(-45, -40, 14, 0, Math.PI * 2);
      ctx.arc(45, -40, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Gaping bloody maw
      ctx.fillStyle = '#0a0204';
      ctx.beginPath();
      ctx.ellipse(0, 80 + progress * 30, 70, 90, 0, 0, Math.PI * 2);
      ctx.fill();

      // Sharp razor teeth
      ctx.fillStyle = '#e2e8f0';
      for (let t = -50; t <= 50; t += 12) {
        ctx.beginPath();
        ctx.moveTo(t, 40);
        ctx.lineTo(t + 6, 75);
        ctx.lineTo(t + 12, 40);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(t, 130 + progress * 30);
        ctx.lineTo(t + 6, 95 + progress * 30);
        ctx.lineTo(t + 12, 130 + progress * 30);
        ctx.fill();
      }

      ctx.restore();

      // Glitch / static lines
      for (let i = 0; i < 20; i++) {
        ctx.fillStyle = `rgba(255, ${Math.random() * 50}, ${Math.random() * 50}, ${Math.random() * 0.4})`;
        ctx.fillRect(0, Math.random() * canvas.height, canvas.width, 2 + Math.random() * 8);
      }

      if (frame < maxFrames) {
        requestAnimationFrame(animate);
      } else {
        this.jumpscareOverlay.style.display = 'none';
        if (onComplete) onComplete();
      }
    };

    requestAnimationFrame(animate);
  }
}
