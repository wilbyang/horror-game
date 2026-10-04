import * as THREE from 'three';
import { CELL_SIZE } from './maze.js';

export const MONSTER_STATE = {
  PATROL: 'PATROL',
  INVESTIGATE: 'INVESTIGATE',
  CHASE: 'CHASE',
  STUNNED: 'STUNNED'
};

export class Monster {
  constructor(scene, maze, soundEngine) {
    this.scene = scene;
    this.maze = maze;
    this.sound = soundEngine;

    this.group = new THREE.Group();
    this.group.position.set(0, 0, 0);

    // AI States
    this.state = MONSTER_STATE.PATROL;
    this.targetPos = new THREE.Vector3();
    this.currentPath = [];
    this.pathIndex = 0;

    // Movement speeds
    this.patrolSpeed = 2.6;
    this.chaseSpeed = 5.2;
    this.investigateSpeed = 3.6;

    // Detection timers
    this.repathTimer = 0;
    this.repathInterval = 0.5; // seconds
    this.lostPlayerTimer = 0;
    this.stunTimer = 0;
    this.stunCooldown = 0;

    // Footstep timer
    this.stepTimer = 0;

    // Animation limbs references
    this.animTime = 0;
    this.leftArm = null;
    this.rightArm = null;
    this.leftLeg = null;
    this.rightLeg = null;
    this.head = null;
    this.jaw = null;
    this.eyeLight = null;

    this.buildMesh();
    this.scene.add(this.group);
  }

  buildMesh() {
    const fleshMat = new THREE.MeshStandardMaterial({
      color: 0x141014,
      roughness: 0.6,
      metalness: 0.2
    });

    const boneMat = new THREE.MeshStandardMaterial({
      color: 0x4a4440,
      roughness: 0.7
    });

    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0xff0022
    });

    // Torso / Ribcage
    const torso = new THREE.Group();
    torso.position.y = 1.7;

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.9, 0.4), fleshMat);
    torso.add(chest);

    // Spine & Ribs
    for (let i = -3; i <= 3; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 8, 16, Math.PI), boneMat);
      rib.position.set(0, i * 0.12, 0.05);
      rib.rotation.x = Math.PI / 2;
      torso.add(rib);
    }

    // Spine spikes
    for (let i = -3; i <= 3; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.25, 4), boneMat);
      spike.position.set(0, i * 0.12, -0.22);
      spike.rotation.x = -Math.PI / 3;
      torso.add(spike);
    }
    this.group.add(torso);
    this.torso = torso;

    // Head & Neck
    this.head = new THREE.Group();
    this.head.position.set(0, 0.65, 0.1);

    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.48), fleshMat);
    this.head.add(skull);

    // Gaping lower jaw
    this.jaw = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.44), boneMat);
    this.jaw.position.set(0, -0.28, 0.08);
    this.head.add(this.jaw);

    // Glowing Menacing Eyes
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), eyeMat);
    eyeL.position.set(-0.12, 0.06, 0.24);
    this.head.add(eyeL);

    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), eyeMat);
    eyeR.position.set(0.12, 0.06, 0.24);
    this.head.add(eyeR);

    // Eye spotlight beams cutting through the gloom
    this.eyeLight = new THREE.SpotLight(0xff0022, 3.5, 14, Math.PI / 4, 0.6, 2.0);
    this.eyeLight.position.set(0, 0.06, 0.3);
    const eyeTarget = new THREE.Object3D();
    eyeTarget.position.set(0, -0.2, 5);
    this.head.add(eyeTarget);
    this.head.add(this.eyeLight);
    this.eyeLight.target = eyeTarget;

    torso.add(this.head);

    // Left Arm (Long lanky articulated arm)
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.45, 0.35, 0);
    const upperArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.7), fleshMat);
    upperArmL.position.y = -0.35;
    this.leftArm.add(upperArmL);

    const forearmL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.8), fleshMat);
    forearmL.position.set(0, -0.85, 0.15);
    forearmL.rotation.x = 0.3;
    this.leftArm.add(forearmL);

    // Claws
    for (let c = -1; c <= 1; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.3, 4), boneMat);
      claw.position.set(c * 0.05, -1.3, 0.3);
      claw.rotation.x = Math.PI / 2;
      this.leftArm.add(claw);
    }
    torso.add(this.leftArm);

    // Right Arm
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.45, 0.35, 0);
    const upperArmR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.7), fleshMat);
    upperArmR.position.y = -0.35;
    this.rightArm.add(upperArmR);

    const forearmR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.8), fleshMat);
    forearmR.position.set(0, -0.85, 0.15);
    forearmR.rotation.x = 0.3;
    this.rightArm.add(forearmR);

    for (let c = -1; c <= 1; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.3, 4), boneMat);
      claw.position.set(c * 0.05, -1.3, 0.3);
      claw.rotation.x = Math.PI / 2;
      this.rightArm.add(claw);
    }
    torso.add(this.rightArm);

    // Left Leg
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.22, 1.25, 0);
    const thighL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.8), fleshMat);
    thighL.position.y = -0.4;
    this.leftLeg.add(thighL);
    const shinL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.85), fleshMat);
    shinL.position.set(0, -1.0, -0.05);
    this.leftLeg.add(shinL);
    this.group.add(this.leftLeg);

    // Right Leg
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.22, 1.25, 0);
    const thighR = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.8), fleshMat);
    thighR.position.y = -0.4;
    this.rightLeg.add(thighR);
    const shinR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.85), fleshMat);
    shinR.position.set(0, -1.0, -0.05);
    this.rightLeg.add(shinR);
    this.group.add(this.rightLeg);
  }

  spawn(pos) {
    this.group.position.copy(pos);
    this.state = MONSTER_STATE.PATROL;
    this.pickNewPatrolDestination();
  }

  pickNewPatrolDestination() {
    // Pick random distant open cell in the maze
    let found = false;
    for (let i = 0; i < 40; i++) {
      const gx = 1 + Math.floor(Math.random() * (this.maze.size - 2));
      const gz = 1 + Math.floor(Math.random() * (this.maze.size - 2));

      if (this.maze.isWalkable(gx, gz)) {
        const dest = this.maze.gridToWorld(gx, gz);
        this.currentPath = this.maze.findPath(this.group.position, dest);
        if (this.currentPath.length > 0) {
          this.pathIndex = 0;
          found = true;
          break;
        }
      }
    }
  }

  // Triggered when player flashes light directly at monster face at close range
  stun() {
    if (this.state === MONSTER_STATE.STUNNED || this.stunCooldown > 0) return;
    this.state = MONSTER_STATE.STUNNED;
    this.stunTimer = 2.4;
    this.stunCooldown = 6.0;
    if (this.sound) {
      this.sound.playMonsterStunned();
    }
  }

  // Triggered by loud player noise (sprinting / key pickup)
  hearNoise(noisePos) {
    if (this.state === MONSTER_STATE.CHASE || this.state === MONSTER_STATE.STUNNED) return;
    this.state = MONSTER_STATE.INVESTIGATE;
    this.currentPath = this.maze.findPath(this.group.position, noisePos);
    this.pathIndex = 0;
    if (this.sound) {
      const dist = this.group.position.distanceTo(noisePos);
      this.sound.playMonsterRoar(dist, false);
    }
  }

  update(delta, playerPos, playerNoise, playerLightingMonster) {
    const distToPlayer = this.group.position.distanceTo(playerPos);

    // Stun cooldown recovery
    if (this.stunCooldown > 0) {
      this.stunCooldown = Math.max(0, this.stunCooldown - delta);
    }

    // Flashlight stun check
    if (playerLightingMonster && distToPlayer < 12 && this.state !== MONSTER_STATE.STUNNED && this.stunCooldown <= 0) {
      this.stun();
    }

    // Handle Stunned state
    if (this.state === MONSTER_STATE.STUNNED) {
      this.stunTimer -= delta;
      this.animateStunned(delta);
      if (this.stunTimer <= 0) {
        // Enraged chase after stun
        this.state = MONSTER_STATE.CHASE;
        this.currentPath = this.maze.findPath(this.group.position, playerPos);
        this.pathIndex = 0;
      }
      return;
    }

    // Check line of sight to player
    const hasLOS = this.maze.hasLineOfSight(this.group.position, playerPos);

    // Hearing check: player sprint noise travels further
    const hearingRadius = 10 * (playerNoise || 0.5);
    const canHear = distToPlayer < hearingRadius;

    // Vision cone: monster can see in front or nearby
    const monsterForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
    const toPlayer = new THREE.Vector3().subVectors(playerPos, this.group.position).normalize();
    const dot = monsterForward.dot(toPlayer);
    const inSightCone = dot > 0.3 || distToPlayer < 6.0;

    // State Transitions
    if (hasLOS && (inSightCone || distToPlayer < 7.0)) {
      if (this.state !== MONSTER_STATE.CHASE) {
        this.state = MONSTER_STATE.CHASE;
        if (this.sound) {
          this.sound.playMonsterRoar(distToPlayer, true);
        }
      }
      this.lostPlayerTimer = 0;
    } else if (canHear && this.state === MONSTER_STATE.PATROL) {
      this.hearNoise(playerPos);
    }

    // Repath timer during chase
    this.repathTimer += delta;
    if (this.state === MONSTER_STATE.CHASE) {
      if (this.repathTimer > 0.4) {
        this.repathTimer = 0;
        this.currentPath = this.maze.findPath(this.group.position, playerPos);
        this.pathIndex = 0;
      }

      if (!hasLOS) {
        this.lostPlayerTimer += delta;
        if (this.lostPlayerTimer > 5.0) {
          // Lost player, investigate last known area
          this.state = MONSTER_STATE.INVESTIGATE;
          this.lostPlayerTimer = 0;
        }
      }
    } else {
      // Patrol or Investigate pathing
      if (this.currentPath.length === 0 || this.pathIndex >= this.currentPath.length) {
        this.pickNewPatrolDestination();
      }
    }

    // Follow Path Waypoints
    let moveSpeed = this.patrolSpeed;
    if (this.state === MONSTER_STATE.CHASE) moveSpeed = this.chaseSpeed;
    if (this.state === MONSTER_STATE.INVESTIGATE) moveSpeed = this.investigateSpeed;

    if (this.currentPath.length > 0 && this.pathIndex < this.currentPath.length) {
      const targetWaypoint = this.currentPath[this.pathIndex];
      const targetFlat = new THREE.Vector3(targetWaypoint.x, this.group.position.y, targetWaypoint.z);
      const toWp = new THREE.Vector3().subVectors(targetFlat, this.group.position);
      const distToWp = toWp.length();

      if (distToWp < 0.8) {
        this.pathIndex++;
      } else {
        toWp.normalize();
        this.group.position.addScaledVector(toWp, moveSpeed * delta);

        // Smooth rotation towards waypoint
        const targetRot = Math.atan2(toWp.x, toWp.z);
        this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, targetRot, 0.15);
      }
    }

    // Prevent monster getting stuck on walls
    this.maze.resolveCollision(this.group.position, 0.6);

    // Procedural animation
    this.animateMovement(delta, moveSpeed);

    // Footstep audio
    const stepInterval = (this.state === MONSTER_STATE.CHASE) ? 0.38 : 0.65;
    this.stepTimer += delta;
    if (this.stepTimer >= stepInterval) {
      this.stepTimer = 0;
      if (this.sound) {
        // Calculate pan angle relative to camera
        const toMonster = new THREE.Vector3().subVectors(this.group.position, playerPos);
        const panAngle = Math.atan2(toMonster.x, toMonster.z);
        this.sound.playMonsterStep(distToPlayer, Math.sin(panAngle));
      }
    }
  }

  animateMovement(delta, speed) {
    const isChasing = (this.state === MONSTER_STATE.CHASE);
    const freq = isChasing ? 12 : 7;
    this.animTime += delta * freq;

    const walkCycle = Math.sin(this.animTime);

    // Legs
    this.leftLeg.rotation.x = walkCycle * 0.6;
    this.rightLeg.rotation.x = -walkCycle * 0.6;

    // Torso hunched posture
    this.torso.rotation.x = isChasing ? 0.35 : 0.15;
    this.torso.position.y = 1.7 + Math.abs(Math.sin(this.animTime * 2)) * 0.08;

    // Arms
    if (isChasing) {
      // Reaching claws forward
      this.leftArm.rotation.x = -0.9 + walkCycle * 0.3;
      this.rightArm.rotation.x = -0.9 - walkCycle * 0.3;
      this.jaw.position.y = -0.34; // Gaping open mouth
    } else {
      // Stalking arm sway
      this.leftArm.rotation.x = -walkCycle * 0.5;
      this.rightArm.rotation.x = walkCycle * 0.5;
      this.jaw.position.y = -0.28;
    }

    // Head twitching
    this.head.rotation.y = Math.sin(this.animTime * 0.5) * 0.2;
    this.head.rotation.z = Math.cos(this.animTime * 0.3) * 0.1;
  }

  animateStunned(delta) {
    this.animTime += delta * 25;
    // Violent shivering
    this.group.position.x += (Math.random() - 0.5) * 0.04;
    this.group.position.z += (Math.random() - 0.5) * 0.04;

    // Shielding face with claws
    this.leftArm.rotation.x = -1.6;
    this.leftArm.rotation.z = 0.5;
    this.rightArm.rotation.x = -1.6;
    this.rightArm.rotation.z = -0.5;

    this.head.rotation.x = -0.4;
    this.torso.rotation.x = -0.2;
  }
}
