import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

export class Player {
  constructor(camera, domElement, soundEngine) {
    this.camera = camera;
    this.domElement = domElement;
    this.sound = soundEngine;

    this.controls = new PointerLockControls(camera, domElement);
    this.radius = 0.5;
    this.height = 1.65;

    // Movement state
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isSprinting = false;

    // Velocity & physics
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.walkSpeed = 4.4;
    this.sprintSpeed = 7.8;

    // Stamina
    this.maxStamina = 100;
    this.stamina = 100;
    this.isExhausted = false;

    // Flashlight
    this.flashlightOn = true;
    this.flashlight = null;
    this.flashlightTarget = null;
    this.flashlightSway = new THREE.Vector3();
    this.battery = 100;

    // Head bob
    this.bobTimer = 0;
    this.stepTimer = 0;

    this.setupFlashlight();
    this.setupKeyListeners();
  }

  setupFlashlight() {
    this.flashlight = new THREE.SpotLight(0xfffaea, 5.2, 38, Math.PI / 5.2, 0.45, 1.4);
    this.flashlight.position.set(0.2, -0.2, 0); // Mounted slightly right of player eyes

    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(0, 0, -10);

    this.camera.add(this.flashlight);
    this.camera.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    // Ambient glow around the player illuminating nearby walls & floor
    this.playerAura = new THREE.PointLight(0xffeedd, 1.1, 7.5, 1.6);
    this.camera.add(this.playerAura);
  }

  setupKeyListeners() {
    const onKeyDown = (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.moveForward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.moveBackward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.moveLeft = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.moveRight = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.isSprinting = true;
          break;
        case 'KeyF':
          this.toggleFlashlight();
          break;
      }
    };

    const onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.moveForward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.moveBackward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.moveLeft = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.moveRight = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.isSprinting = false;
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.visible = this.flashlightOn;
    if (this.sound) {
      this.sound.playFlashlightClick();
    }
  }

  resetPosition(spawnPos) {
    this.camera.position.set(spawnPos.x, this.height, spawnPos.z);
    this.camera.rotation.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.stamina = 100;
    this.isExhausted = false;
    this.flashlightOn = true;
    this.flashlight.visible = true;
  }

  update(delta, maze) {
    if (!this.controls.isLocked) return;

    // Stamina calculation
    const isMoving = this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
    const canSprint = this.isSprinting && isMoving && !this.isExhausted && this.stamina > 0;

    if (canSprint) {
      this.stamina = Math.max(0, this.stamina - delta * 24);
      if (this.stamina <= 0) {
        this.isExhausted = true;
      }
    } else {
      const recoveryRate = isMoving ? 14 : 26;
      this.stamina = Math.min(this.maxStamina, this.stamina + delta * recoveryRate);
      if (this.isExhausted && this.stamina > 30) {
        this.isExhausted = false;
      }
    }

    // Flashlight battery (slow recharge when off, slow drain when on)
    if (this.flashlightOn) {
      this.battery = Math.max(0, this.battery - delta * 1.5);
      if (this.battery <= 0) {
        this.flashlightOn = false;
        this.flashlight.visible = false;
      }
    } else {
      this.battery = Math.min(100, this.battery + delta * 6);
    }

    // Calculate movement velocity
    const currentSpeed = canSprint ? this.sprintSpeed : this.walkSpeed;

    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.normalize();

    // Smooth movement dampening
    const targetVelX = this.direction.x * currentSpeed;
    const targetVelZ = this.direction.z * currentSpeed;

    const smoothFactor = 12.0;
    this.velocity.x += (targetVelX - this.velocity.x) * Math.min(1, delta * smoothFactor);
    this.velocity.z += (targetVelZ - this.velocity.z) * Math.min(1, delta * smoothFactor);

    // Apply movement in camera forward/right directions
    if (Math.abs(this.velocity.x) > 0.01 || Math.abs(this.velocity.z) > 0.01) {
      this.controls.moveRight(this.velocity.x * delta);
      this.controls.moveForward(this.velocity.z * delta);
    }

    // Solve wall collisions
    maze.resolveCollision(this.camera.position, this.radius);

    // Head bobbing and footstep sounds
    const actualSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (actualSpeed > 0.5) {
      const bobFreq = canSprint ? 14 : 9.5;
      const bobAmp = canSprint ? 0.08 : 0.045;
      this.bobTimer += delta * bobFreq;

      const bobY = Math.sin(this.bobTimer) * bobAmp;
      this.camera.position.y = this.height + bobY;

      // Footstep cadence
      const stepInterval = canSprint ? 0.32 : 0.48;
      this.stepTimer += delta;
      if (this.stepTimer >= stepInterval) {
        this.stepTimer = 0;
        if (this.sound) {
          this.sound.playPlayerStep(canSprint);
        }
      }
    } else {
      // Idle breathing sway
      this.bobTimer += delta * 1.5;
      this.camera.position.y = this.height + Math.sin(this.bobTimer) * 0.015;
    }

    // Flashlight lag / sway
    const swayTarget = new THREE.Vector3(
      -this.velocity.x * 0.08,
      -Math.abs(this.velocity.z) * 0.04,
      -10
    );
    this.flashlightTarget.position.lerp(swayTarget, 0.12);
  }

  // Check if player is looking at the monster with flashlight
  isLightingObject(targetPos) {
    if (!this.flashlightOn) return false;

    const camPos = this.camera.position;
    const toTarget = new THREE.Vector3().subVectors(targetPos, camPos);
    const dist = toTarget.length();
    if (dist > 26) return false; // Out of flashlight reach

    toTarget.normalize();
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);

    const dot = camDir.dot(toTarget);
    // Dot product > 0.88 corresponds to being inside the flashlight beam cone (~30 deg)
    return dot > 0.88;
  }

  getNoiseLevel() {
    const isMoving = this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
    if (!isMoving) return 0;
    return this.isSprinting && !this.isExhausted ? 2.0 : 0.8;
  }
}
