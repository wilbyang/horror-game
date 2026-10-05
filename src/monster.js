import * as THREE from 'three';
import { CELL_SIZE } from './maze.js';
import { TextureGenerator } from './textures.js';

export const MONSTER_STATE = {
  PATROL: 'PATROL',
  INVESTIGATE: 'INVESTIGATE',
  CHASE: 'CHASE',
  STUNNED: 'STUNNED',
  KILLING: 'KILLING'
};

export class Monster {
  constructor(scene, maze, soundEngine, isWorld2 = false, variant = 0) {
    this.scene = scene;
    this.maze = maze;
    this.sound = soundEngine;
    this.isWorld2 = isWorld2;
    this.variant = variant; // 0 = Stalker Alpha (Crimson Fiend), 1 = Stalker Beta (Void Specter)
    this.name = this.isWorld2 ? (variant === 1 ? 'Stalker Beta' : 'Stalker Alpha') : 'Dread Walker';

    this.group = new THREE.Group();
    this.group.position.set(0, 0, 0);

    // AI States
    this.state = MONSTER_STATE.PATROL;
    this.targetPos = new THREE.Vector3();
    this.targetRotY = 0;
    this.currentPath = [];
    this.pathIndex = 0;

    // Movement speeds (World 2 monster is faster than player's 4.4 walkSpeed!)
    this.patrolSpeed = this.isWorld2 ? 2.5 : 1.9;
    this.chaseSpeed = this.isWorld2 ? 4.75 : 3.6;
    this.investigateSpeed = this.isWorld2 ? 3.3 : 2.6;

    // Detection timers
    this.repathTimer = 0;
    this.lostPlayerTimer = 0;
    this.stunTimer = 0;
    this.stunCooldown = 0;
    this.stepTimer = 0;

    // Animation & limb references
    this.animTime = 0;
    this.twitchTimer = 0;
    this.torso = null;
    this.head = null;
    this.jaw = null;
    this.eyeLight = null;
    this.heart = null;

    this.leftArm = null;
    this.rightArm = null;
    this.leftForearm = null;
    this.rightForearm = null;
    this.leftFingers = [];
    this.rightFingers = [];

    this.leftLeg = null;
    this.rightLeg = null;
    this.leftShin = null;
    this.rightShin = null;

    this.backSpikes = [];

    this.buildRealisticMonster();
    this.scene.add(this.group);
  }

  buildRealisticMonster() {
    const isBeta = (this.isWorld2 && this.variant === 1);

    // Realistic PBR Necrotic Flesh Material
    let skinTex;
    if (this.isWorld2) {
      skinTex = isBeta
        ? TextureGenerator.createVoidMonsterSkinTexture()
        : TextureGenerator.createCrimsonMonsterSkinTexture();
    } else {
      skinTex = TextureGenerator.createMonsterSkinTexture();
    }
    const roughTex = TextureGenerator.createMonsterRoughnessTexture();
    const boneTex = this.isWorld2 ? TextureGenerator.createAbyssalMonsterBoneTexture() : TextureGenerator.createMonsterBoneTexture();

    const fleshMat = new THREE.MeshStandardMaterial({
      map: skinTex,
      roughnessMap: roughTex,
      roughness: 0.65,
      metalness: this.isWorld2 ? 0.32 : 0.18,
      bumpMap: skinTex,
      bumpScale: 0.05,
      emissive: isBeta ? 0x240638 : (this.isWorld2 ? 0x330512 : 0x000000),
      emissiveIntensity: this.isWorld2 ? 0.75 : 0
    });

    const boneMat = new THREE.MeshStandardMaterial({
      map: boneTex,
      color: isBeta ? 0x24122e : (this.isWorld2 ? 0x2b1016 : 0xffffff),
      roughness: 0.65,
      metalness: this.isWorld2 ? 0.35 : 0.1,
      bumpMap: boneTex,
      bumpScale: 0.04
    });

    const fangMat = new THREE.MeshStandardMaterial({
      color: this.isWorld2 ? 0xffffff : 0xe8e0cf,
      emissive: isBeta ? 0x4c0a78 : (this.isWorld2 ? 0x550015 : 0x000000),
      emissiveIntensity: this.isWorld2 ? 0.75 : 0,
      roughness: 0.25,
      metalness: 0.15
    });

    const mouthInsideMat = new THREE.MeshStandardMaterial({
      color: isBeta ? 0x19032b : (this.isWorld2 ? 0x1a0208 : 0x1f060a),
      roughness: 0.2,
      metalness: 0.1
    });

    const eyeMat = new THREE.MeshBasicMaterial({
      color: isBeta ? 0xa855f7 : (this.isWorld2 ? 0xff0033 : 0xff0022)
    });

    // Root Torso
    this.torso = new THREE.Group();
    this.torso.position.y = 1.65;

    // Muscular hunched chest & back
    const chestGeo = new THREE.CylinderGeometry(0.38, 0.28, 0.95, 12);
    const chest = new THREE.Mesh(chestGeo, fleshMat);
    chest.position.set(0, 0.1, 0);
    chest.rotation.x = 0.2; // naturally hunched forward
    this.torso.add(chest);

    // Anatomical Spine Vertebrae
    for (let v = 0; v < 8; v++) {
      const vertGeo = new THREE.CylinderGeometry(0.065, 0.075, 0.1, 8);
      const vert = new THREE.Mesh(vertGeo, boneMat);
      vert.position.set(0, 0.45 - v * 0.12, -0.22 - Math.sin(v * 0.4) * 0.08);
      vert.rotation.x = Math.PI / 2;
      this.torso.add(vert);

      // Jagged protruding spinal bone spurs (longer scythe blades in World 2)
      const spikeLen = this.isWorld2 ? (0.34 + (v % 3) * 0.12) : (0.22 + (v % 3) * 0.08);
      const spikeGeo = new THREE.ConeGeometry(0.04, spikeLen, 4);
      const spike = new THREE.Mesh(spikeGeo, boneMat);
      spike.position.set(0, 0.45 - v * 0.12, -0.32 - Math.sin(v * 0.4) * 0.08);
      spike.rotation.x = -Math.PI / 2.6;
      this.torso.add(spike);
      this.backSpikes.push(spike);
    }

    // Realistic Ribcage (Curving 3D bone ribs)
    for (let r = 0; r < 5; r++) {
      const ribRadius = 0.32 - r * 0.02;
      const ribGeo = new THREE.TorusGeometry(ribRadius, 0.028, 8, 20, Math.PI * 0.95);
      const rib = new THREE.Mesh(ribGeo, boneMat);
      rib.position.set(0, 0.38 - r * 0.14, 0.02);
      rib.rotation.x = Math.PI / 2 + 0.15;
      rib.rotation.z = Math.PI * 0.025;
      this.torso.add(rib);
    }

    // Exposed Pulsating Viscera / Dark Heart inside ribcage
    const heartGeo = new THREE.DodecahedronGeometry(0.14, 1);
    const heartMat = new THREE.MeshStandardMaterial({
      color: isBeta ? 0x3b0764 : (this.isWorld2 ? 0x440810 : 0x220508),
      emissive: isBeta ? 0x9333ea : (this.isWorld2 ? 0xdd1133 : 0x220005),
      emissiveIntensity: this.isWorld2 ? 0.95 : 0.3,
      roughness: 0.15,
      metalness: 0.2
    });
    this.heart = new THREE.Mesh(heartGeo, heartMat);
    this.heart.position.set(0, 0.18, 0.05);
    this.torso.add(this.heart);

    // Clavicles / Collarbones
    const clavicleL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.45, 8), boneMat);
    clavicleL.position.set(-0.24, 0.52, 0.08);
    clavicleL.rotation.z = Math.PI / 3;
    this.torso.add(clavicleL);

    const clavicleR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.45, 8), boneMat);
    clavicleR.position.set(0.24, 0.52, 0.08);
    clavicleR.rotation.z = -Math.PI / 3;
    this.torso.add(clavicleR);

    // Realistic Grotesque Head & Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.35, 8), fleshMat);
    neck.position.set(0, 0.65, 0.12);
    neck.rotation.x = 0.35;
    this.torso.add(neck);

    this.head = new THREE.Group();
    this.head.position.set(0, 0.82, 0.24);

    // Elongated humanoid cranium
    const craniumGeo = new THREE.SphereGeometry(0.26, 12, 12);
    craniumGeo.scale(1.0, 1.25, 1.35);
    const skull = new THREE.Mesh(craniumGeo, fleshMat);
    skull.position.set(0, 0.08, 0);
    this.head.add(skull);

    // Pronounced Brow Ridge & Sunken Cheeks
    const browGeo = new THREE.BoxGeometry(0.42, 0.1, 0.2);
    const brow = new THREE.Mesh(browGeo, boneMat);
    brow.position.set(0, 0.14, 0.26);
    this.head.add(brow);

    // Sunken Eye Sockets
    const socketMat = new THREE.MeshBasicMaterial({ color: 0x050102 });
    const socketL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), socketMat);
    socketL.position.set(-0.13, 0.06, 0.26);
    this.head.add(socketL);

    const socketR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), socketMat);
    socketR.position.set(0.13, 0.06, 0.26);
    this.head.add(socketR);

    // Piercing Glowing Eyes
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
    eyeL.position.set(-0.13, 0.06, 0.31);
    this.head.add(eyeL);

    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
    eyeR.position.set(0.13, 0.06, 0.31);
    this.head.add(eyeR);

    // World 2: Demonic Horns & Secondary Quad Glowing Eyes
    if (this.isWorld2) {
      for (const side of [-1, 1]) {
        const hornCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.16, 0.22, 0.08),
          new THREE.Vector3(side * 0.34, 0.44, 0.02),
          new THREE.Vector3(side * 0.48, 0.62, -0.16),
          new THREE.Vector3(side * 0.38, 0.76, -0.28)
        ]);
        const hornGeo = new THREE.TubeGeometry(hornCurve, 14, 0.05, 8, false);
        const horn = new THREE.Mesh(hornGeo, boneMat);
        this.head.add(horn);
      }

      // Secondary Upper Eyes (Quad blazing gaze)
      const eyeMatQuad = new THREE.MeshBasicMaterial({ color: isBeta ? 0xe879f9 : 0xff2a55 });
      const eyeUpperL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMatQuad);
      eyeUpperL.position.set(-0.16, 0.16, 0.28);
      this.head.add(eyeUpperL);

      const eyeUpperR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMatQuad);
      eyeUpperR.position.set(0.16, 0.16, 0.28);
      this.head.add(eyeUpperR);
    }

    // Eye spotlight beams cutting through dark corridors
    const spotColor = isBeta ? 0x9333ea : (this.isWorld2 ? 0xff0033 : 0xff0820);
    this.eyeLight = new THREE.SpotLight(spotColor, 4.5, 16, Math.PI / 4, 0.6, 1.8);
    this.eyeLight.position.set(0, 0.06, 0.35);
    const eyeTarget = new THREE.Object3D();
    eyeTarget.position.set(0, -0.3, 6);
    this.head.add(eyeTarget);
    this.head.add(this.eyeLight);
    this.eyeLight.target = eyeTarget;

    // Intense horror illumination light for jumpscare (vividly lights up the face, fangs, and eyes)
    const faceLightColor = isBeta ? 0xc026d3 : 0xff2233;
    this.jumpscareFaceLight = new THREE.PointLight(faceLightColor, 0, 4.5, 1.2);
    this.jumpscareFaceLight.position.set(0, 0.15, 0.55);
    this.head.add(this.jumpscareFaceLight);

    // Upper Jaw & Fangs
    const upperJaw = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.28), boneMat);
    upperJaw.position.set(0, -0.06, 0.22);
    this.head.add(upperJaw);

    // Upper Needle Fangs (10 razor teeth)
    for (let t = -4; t <= 4; t++) {
      const toothGeo = new THREE.ConeGeometry(0.018, 0.1 + Math.abs(t === 2 || t === -2 ? 0.06 : 0), 4);
      const tooth = new THREE.Mesh(toothGeo, fangMat);
      tooth.position.set(t * 0.035, -0.16, 0.32 - Math.abs(t) * 0.02);
      tooth.rotation.x = Math.PI;
      this.head.add(tooth);
    }

    // Hinged Lower Jaw
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.14, 0.14);

    const lowerJawBone = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.32), boneMat);
    lowerJawBone.position.set(0, -0.08, 0.12);
    this.jaw.add(lowerJawBone);

    // Inside Gullet / Slime Throat
    const throat = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.22), mouthInsideMat);
    throat.position.set(0, -0.04, 0.08);
    this.jaw.add(throat);

    // Lower Needle Fangs (10 razor teeth intermeshing with upper)
    for (let t = -4; t <= 4; t++) {
      const toothGeo = new THREE.ConeGeometry(0.016, 0.09 + Math.abs(t === 1 || t === -1 ? 0.05 : 0), 4);
      const tooth = new THREE.Mesh(toothGeo, fangMat);
      tooth.position.set(t * 0.032, 0.02, 0.26 - Math.abs(t) * 0.02);
      this.jaw.add(tooth);
    }

    this.head.add(this.jaw);
    this.torso.add(this.head);

    // Realistic Elongated Left Arm (Ball shoulder, humerus, elbow, forearm, 5 articulated clawed fingers)
    this.leftArm = this.buildArm(fleshMat, boneMat, fangMat, -1);
    this.leftArm.position.set(-0.48, 0.42, 0);
    this.torso.add(this.leftArm);

    // Right Arm
    this.rightArm = this.buildArm(fleshMat, boneMat, fangMat, 1);
    this.rightArm.position.set(0.48, 0.42, 0);
    this.torso.add(this.rightArm);

    this.group.add(this.torso);

    // Realistic Legs (Hunched stalker legs with knobby knees and clawed feet)
    this.leftLeg = this.buildLeg(fleshMat, boneMat, fangMat, -1);
    this.leftLeg.position.set(-0.25, 1.25, -0.05);
    this.group.add(this.leftLeg);

    this.rightLeg = this.buildLeg(fleshMat, boneMat, fangMat, 1);
    this.rightLeg.position.set(0.25, 1.25, -0.05);
    this.group.add(this.rightLeg);
  }

  buildArm(fleshMat, boneMat, clawMat, side) {
    const armGroup = new THREE.Group();

    // Shoulder deltoid
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), fleshMat);
    armGroup.add(shoulder);

    // Upper arm (humerus)
    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.72, 8), fleshMat);
    upperArm.position.set(0, -0.36, 0);
    armGroup.add(upperArm);

    // Elbow joint
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), boneMat);
    elbow.position.set(0, -0.72, 0);
    armGroup.add(elbow);

    // Forearm
    const forearmGroup = new THREE.Group();
    forearmGroup.position.set(0, -0.72, 0);

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.85, 8), fleshMat);
    forearm.position.set(0, -0.42, 0.12);
    forearm.rotation.x = 0.28;
    forearmGroup.add(forearm);

    // Wrist
    const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.12), boneMat);
    wrist.position.set(0, -0.86, 0.24);
    forearmGroup.add(wrist);

    // 5 Articulated Clawed Fingers
    const fingerRefs = [];
    const fingerSpreads = [-0.055, -0.028, 0, 0.028, 0.055];
    for (let f = 0; f < 5; f++) {
      const fingerGroup = new THREE.Group();
      fingerGroup.position.set(fingerSpreads[f], -0.89, 0.26);

      // Phalanx bone
      const phalanx = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.18, 6), fleshMat);
      phalanx.position.set(0, -0.09, 0.04);
      phalanx.rotation.x = 0.4;
      fingerGroup.add(phalanx);

      // Sharp curved talon
      const talon = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.22, 5), clawMat);
      talon.position.set(0, -0.22, 0.12);
      talon.rotation.x = Math.PI / 2.2;
      fingerGroup.add(talon);

      forearmGroup.add(fingerGroup);
      fingerRefs.push(fingerGroup);
    }

    if (side === -1) {
      this.leftForearm = forearmGroup;
      this.leftFingers = fingerRefs;
    } else {
      this.rightForearm = forearmGroup;
      this.rightFingers = fingerRefs;
    }

    armGroup.add(forearmGroup);
    return armGroup;
  }

  buildLeg(fleshMat, boneMat, clawMat, side) {
    const legGroup = new THREE.Group();

    // Hip joint
    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), fleshMat);
    legGroup.add(hip);

    // Muscular thigh (femur)
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.78, 8), fleshMat);
    thigh.position.set(0, -0.38, 0.05);
    thigh.rotation.x = -0.15;
    legGroup.add(thigh);

    // Knobby knee joint
    const knee = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.14), boneMat);
    knee.position.set(0, -0.76, 0.12);
    legGroup.add(knee);

    // Shin (tibia)
    const shinGroup = new THREE.Group();
    shinGroup.position.set(0, -0.76, 0.12);

    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.85, 8), fleshMat);
    shin.position.set(0, -0.42, -0.08);
    shin.rotation.x = 0.2;
    shinGroup.add(shin);

    // Ankle & 4-toed raptor claw foot
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.35), boneMat);
    foot.position.set(0, -0.84, 0.06);
    shinGroup.add(foot);

    for (let toe = -1.5; toe <= 1.5; toe += 1) {
      const talon = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.18, 4), clawMat);
      talon.position.set(toe * 0.05, -0.86, 0.28);
      talon.rotation.x = Math.PI / 2.2;
      shinGroup.add(talon);
    }

    if (side === -1) {
      this.leftShin = shinGroup;
    } else {
      this.rightShin = shinGroup;
    }

    legGroup.add(shinGroup);
    return legGroup;
  }

  spawn(pos) {
    this.group.position.copy(pos);
    this.state = MONSTER_STATE.PATROL;
    this.pickNewPatrolDestination();
  }

  pickNewPatrolDestination() {
    const s = this.maze.size;
    const mid = Math.floor(s / 2);

    for (let i = 0; i < 40; i++) {
      let minGx = 1, maxGx = s - 2;
      let minGz = 1, maxGz = s - 2;

      // In World 2, encourage the 2 stalkers to patrol separate sectors 70% of the time
      if (this.isWorld2 && Math.random() < 0.7) {
        if (this.variant === 0) {
          maxGx = mid; // West wing
        } else if (this.variant === 1) {
          minGx = mid; // East wing
        }
      }

      const gx = minGx + Math.floor(Math.random() * (maxGx - minGx + 1));
      const gz = minGz + Math.floor(Math.random() * (maxGz - minGz + 1));

      if (this.maze.isWalkable(gx, gz)) {
        const dest = this.maze.gridToWorld(gx, gz);
        this.currentPath = this.maze.findPath(this.group.position, dest);
        if (this.currentPath.length > 0) {
          this.pathIndex = 0;
          break;
        }
      }
    }
  }

  stun() {
    if (this.state === MONSTER_STATE.STUNNED || this.state === MONSTER_STATE.KILLING || this.stunCooldown > 0) return;
    this.state = MONSTER_STATE.STUNNED;
    this.stunTimer = this.isWorld2 ? 1.2 : 2.4;
    this.stunCooldown = this.isWorld2 ? 12.0 : 6.0;
    if (this.sound) {
      this.sound.playMonsterStunned();
    }
  }

  hearNoise(noisePos) {
    if (this.state === MONSTER_STATE.CHASE || this.state === MONSTER_STATE.STUNNED || this.state === MONSTER_STATE.KILLING) return;
    this.state = MONSTER_STATE.INVESTIGATE;
    this.currentPath = this.maze.findPath(this.group.position, noisePos);
    this.pathIndex = 0;
    if (this.sound) {
      const dist = this.group.position.distanceTo(noisePos);
      this.sound.playMonsterRoar(dist, false, this.variant);
    }
  }

  update(delta, playerPos, playerNoise, playerLightingMonster, camera = null) {
    if (this.state === MONSTER_STATE.KILLING) return; // Managed by jumpscare sequence

    const distToPlayer = Math.hypot(
      this.group.position.x - playerPos.x,
      this.group.position.z - playerPos.z
    );

    // Stun cooldown recovery
    if (this.stunCooldown > 0) {
      this.stunCooldown = Math.max(0, this.stunCooldown - delta);
    }

    // Flashlight stun check
    if (playerLightingMonster && distToPlayer < 14 && this.state !== MONSTER_STATE.STUNNED && this.stunCooldown <= 0) {
      this.stun();
    }

    // Handle Stunned state
    if (this.state === MONSTER_STATE.STUNNED) {
      this.stunTimer -= delta;
      this.animateStunned(delta);
      if (this.stunTimer <= 0) {
        this.state = MONSTER_STATE.CHASE;
        this.currentPath = this.maze.findPath(this.group.position, playerPos);
        this.pathIndex = 0;
      }
      return;
    }

    // Line of sight & hearing (World 2 monster has far sharper senses)
    const hasLOS = this.maze.hasLineOfSight(this.group.position, playerPos);
    const hearingRadius = (this.isWorld2 ? 18.0 : 11.0) * (playerNoise || 0.5);
    const canHear = distToPlayer < hearingRadius;

    // Vision cone (horizontal 2D plane)
    const monsterForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
    monsterForward.y = 0;
    monsterForward.normalize();
    const toPlayer = new THREE.Vector3(
      playerPos.x - this.group.position.x,
      0,
      playerPos.z - this.group.position.z
    ).normalize();
    const dot = monsterForward.dot(toPlayer);
    const inSightCone = dot > (this.isWorld2 ? 0.15 : 0.25) || distToPlayer < (this.isWorld2 ? 12.0 : 7.0);

    // State Transitions
    if (hasLOS && (inSightCone || distToPlayer < (this.isWorld2 ? 13.0 : 8.0))) {
      if (this.state !== MONSTER_STATE.CHASE) {
        this.state = MONSTER_STATE.CHASE;
        if (this.sound) {
          this.sound.playMonsterRoar(distToPlayer, true, this.variant);
        }
      }
      this.lostPlayerTimer = 0;
    } else if (canHear && this.state === MONSTER_STATE.PATROL) {
      this.hearNoise(playerPos);
    }

    // Repath timer during chase (World 2 navigates corners twice as fast)
    this.repathTimer += delta;
    if (this.state === MONSTER_STATE.CHASE) {
      const repathInterval = this.isWorld2 ? 0.18 : 0.35;
      if (this.repathTimer > repathInterval) {
        this.repathTimer = 0;
        this.currentPath = this.maze.findPath(this.group.position, playerPos);
        this.pathIndex = 0;
      }

      if (!hasLOS) {
        this.lostPlayerTimer += delta;
        if (this.lostPlayerTimer > 5.5) {
          this.state = MONSTER_STATE.INVESTIGATE;
          this.lostPlayerTimer = 0;
        }
      }
    } else {
      if (this.currentPath.length === 0 || this.pathIndex >= this.currentPath.length) {
        this.pickNewPatrolDestination();
      }
    }

    // Move along path or charge directly if clear line of sight
    let moveSpeed = this.patrolSpeed;
    if (this.state === MONSTER_STATE.CHASE) moveSpeed = this.chaseSpeed;
    if (this.state === MONSTER_STATE.INVESTIGATE) moveSpeed = this.investigateSpeed;

    if (this.state === MONSTER_STATE.CHASE && (hasLOS || distToPlayer < 3.5)) {
      // Direct sprint toward player when visible
      const toDirect = new THREE.Vector3(
        playerPos.x - this.group.position.x,
        0,
        playerPos.z - this.group.position.z
      );
      if (toDirect.length() > 0.1) {
        toDirect.normalize();
        this.group.position.addScaledVector(toDirect, moveSpeed * delta);
        const targetRot = Math.atan2(toDirect.x, toDirect.z);
        this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, targetRot, 0.22);
      }
    } else if (this.currentPath.length > 0 && this.pathIndex < this.currentPath.length) {
      const targetWaypoint = this.currentPath[this.pathIndex];
      const targetFlat = new THREE.Vector3(targetWaypoint.x, this.group.position.y, targetWaypoint.z);
      const toWp = new THREE.Vector3().subVectors(targetFlat, this.group.position);
      const distToWp = toWp.length();

      if (distToWp < 0.8) {
        this.pathIndex++;
      } else {
        toWp.normalize();
        this.group.position.addScaledVector(toWp, moveSpeed * delta);

        const targetRot = Math.atan2(toWp.x, toWp.z);
        this.group.rotation.y = THREE.MathUtils.lerp(this.group.rotation.y, targetRot, 0.16);
      }
    }

    this.maze.resolveCollision(this.group.position, 0.65);

    // Animate Realistic Locomotion
    this.animateMovement(delta, moveSpeed);

    // Footstep audio
    const stepInterval = (this.state === MONSTER_STATE.CHASE) ? (this.isWorld2 ? 0.25 : 0.34) : 0.62;
    this.stepTimer += delta;
    if (this.stepTimer >= stepInterval) {
      this.stepTimer = 0;
      if (this.sound) {
        let stereoPan = 0;
        if (camera) {
          const toMonster = new THREE.Vector3().subVectors(this.group.position, playerPos);
          toMonster.y = 0;
          if (toMonster.lengthSq() > 0.001) {
            toMonster.normalize();
            const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            stereoPan = Math.max(-1, Math.min(1, toMonster.dot(camRight)));
          }
        }
        this.sound.playMonsterStep(distToPlayer, stereoPan);
      }
    }
  }

  // Smooth remote interpolation for Guest players in Co-op mode
  updateAsRemote(delta, camera, playerPos) {
    if (!this.targetPos) this.targetPos = new THREE.Vector3().copy(this.group.position);

    // Smooth position interpolation from network packets
    this.group.position.lerp(this.targetPos, Math.min(1.0, delta * 16));

    // Smooth yaw rotation interpolation
    if (this.targetRotY !== undefined) {
      let diff = this.targetRotY - this.group.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.group.rotation.y += diff * Math.min(1.0, delta * 16);
    }

    const distToPlayer = Math.hypot(
      this.group.position.x - playerPos.x,
      this.group.position.z - playerPos.z
    );

    // Dynamic eye spotlight flicker
    if (this.eyeLight) {
      this.eyeLight.intensity = (this.state === MONSTER_STATE.CHASE)
        ? (5.5 + Math.sin(performance.now() * 0.02) * 1.5)
        : (3.8 + Math.sin(performance.now() * 0.005) * 0.8);
    }

    if (this.state === MONSTER_STATE.STUNNED) {
      this.animateStunned(delta);
    } else {
      const speed = (this.state === MONSTER_STATE.CHASE) ? this.chaseSpeed : this.patrolSpeed;
      this.animateMovement(delta, speed);
    }

    // Footstep audio with spatial 3D stereo panning for guest
    const stepInterval = (this.state === MONSTER_STATE.CHASE) ? (this.isWorld2 ? 0.25 : 0.34) : 0.62;
    this.stepTimer += delta;
    if (this.stepTimer >= stepInterval) {
      this.stepTimer = 0;
      if (this.sound) {
        let stereoPan = 0;
        if (camera) {
          const toMonster = new THREE.Vector3().subVectors(this.group.position, playerPos);
          toMonster.y = 0;
          if (toMonster.lengthSq() > 0.001) {
            toMonster.normalize();
            const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            stereoPan = Math.max(-1, Math.min(1, toMonster.dot(camRight)));
          }
        }
        this.sound.playMonsterStep(distToPlayer, stereoPan);
      }
    }
  }

  animateMovement(delta, speed) {
    const isChasing = (this.state === MONSTER_STATE.CHASE);
    const freq = isChasing ? 13 : 7.5;
    this.animTime += delta * freq;

    const cycle = Math.sin(this.animTime);

    // Natural Leg Stride
    this.leftLeg.rotation.x = cycle * 0.65;
    this.rightLeg.rotation.x = -cycle * 0.65;
    this.leftShin.rotation.x = Math.max(0, -cycle * 0.5);
    this.rightShin.rotation.x = Math.max(0, cycle * 0.5);

    // Torso Hunched Posture & Bobbing
    this.torso.rotation.x = isChasing ? 0.38 : 0.18;
    this.torso.position.y = 1.65 + Math.abs(Math.sin(this.animTime * 2)) * 0.09;

    // Reset jumpscare-specific head & arm scaling
    this.head.position.set(0, 0.82, 0.24);
    this.head.scale.set(1, 1, 1);
    this.leftArm.position.set(-0.48, 0.42, 0);
    this.rightArm.position.set(0.48, 0.42, 0);
    if (this.jumpscareFaceLight) this.jumpscareFaceLight.intensity = 0;

    // Heart pulsation
    if (this.heart) {
      const pulse = 1.0 + Math.sin(this.animTime * 4) * 0.12;
      this.heart.scale.set(pulse, pulse, pulse);
    }

    // Back spikes twitch
    for (let i = 0; i < this.backSpikes.length; i++) {
      this.backSpikes[i].rotation.z = Math.sin(this.animTime * 2 + i) * 0.08;
    }

    // Arms & Claws Animation
    if (isChasing) {
      // Aggressive reaching forward to grab player
      this.leftArm.rotation.x = -1.1 + cycle * 0.25;
      this.rightArm.rotation.x = -1.1 - cycle * 0.25;
      this.leftForearm.rotation.x = 0.5 + Math.sin(this.animTime * 2) * 0.15;
      this.rightForearm.rotation.x = 0.5 - Math.sin(this.animTime * 2) * 0.15;

      // Jaws unhinged open in roar
      this.jaw.rotation.x = 0.45 + Math.sin(this.animTime * 3) * 0.1;
    } else {
      // Stalking sway
      this.leftArm.rotation.x = -cycle * 0.5;
      this.rightArm.rotation.x = cycle * 0.5;
      this.leftForearm.rotation.x = 0.15;
      this.rightForearm.rotation.x = 0.15;
      this.jaw.rotation.x = 0.08;
    }

    // Twitching fingers
    this.leftFingers.forEach((f, idx) => {
      f.rotation.x = Math.sin(this.animTime * 3 + idx) * 0.2;
    });
    this.rightFingers.forEach((f, idx) => {
      f.rotation.x = Math.cos(this.animTime * 3 + idx) * 0.2;
    });

    // Random Head Micro-Twitches (Creepy horror entity stutters)
    this.twitchTimer += delta;
    if (this.twitchTimer > 1.8) {
      this.twitchTimer = 0;
      this.head.rotation.z = (Math.random() - 0.5) * 0.4;
      this.head.rotation.y = (Math.random() - 0.5) * 0.6;
    } else {
      this.head.rotation.z = THREE.MathUtils.lerp(this.head.rotation.z, 0, delta * 3);
      this.head.rotation.y = THREE.MathUtils.lerp(this.head.rotation.y, 0, delta * 3);
    }
  }

  animateStunned(delta) {
    this.animTime += delta * 28;
    this.group.position.x += (Math.random() - 0.5) * 0.05;
    this.group.position.z += (Math.random() - 0.5) * 0.05;

    // Shielding face with claws
    this.leftArm.rotation.x = -1.6;
    this.leftArm.rotation.z = 0.55;
    this.rightArm.rotation.x = -1.6;
    this.rightArm.rotation.z = -0.55;

    this.head.rotation.x = -0.4;
    this.torso.rotation.x = -0.25;
  }

  // Cinematic Jumpscare Animation (Monster's huge roaring head lunges right into your face!)
  animateJumpscareLunge(progress, cameraPos) {
    this.state = MONSTER_STATE.KILLING;

    // Face directly towards the camera lens (+Z faces camera)
    const dx = cameraPos.x - this.group.position.x;
    const dz = cameraPos.z - this.group.position.z;
    if (Math.hypot(dx, dz) > 0.001) {
      this.group.rotation.y = Math.atan2(dx, dz);
    }

    // Lower torso and tilt forward so head is dead level with camera eye height (1.65m)
    this.torso.position.y = THREE.MathUtils.lerp(1.65, 1.15, Math.min(1, progress * 3));
    this.torso.rotation.x = THREE.MathUtils.lerp(0.3, 0.55, Math.min(1, progress * 3));

    // Head thrusts forward right between the arms, right into the center of the camera
    const lungeFwd = THREE.MathUtils.lerp(0.24, 0.72, Math.min(1, progress * 2.5));
    const lungeY = THREE.MathUtils.lerp(0.82, 0.48, Math.min(1, progress * 2.5));
    this.head.position.set(
      (Math.random() - 0.5) * 0.04, // violent horror micro-jitter
      lungeY + (Math.random() - 0.5) * 0.03,
      lungeFwd
    );

    // Make the terrifying demonic head 45% larger during the jumpscare so it fills the screen
    const headScale = THREE.MathUtils.lerp(1.0, 1.45, Math.min(1, progress * 2));
    this.head.scale.set(headScale, headScale, headScale);

    // Unhinge jaw wide open with terrifying roaring and snapping teeth
    const jawSnap = Math.sin(progress * 38) * 0.15;
    this.jaw.rotation.x = THREE.MathUtils.lerp(0.35, 0.95, Math.min(1, progress * 2)) + jawSnap;

    // Arms pull outward to the left and right borders of the screen to frame the roaring head
    const clawSwipe = Math.sin(progress * 24) * 0.12;
    this.leftArm.position.set(-0.72, 0.28, 0.2);
    this.rightArm.position.set(0.72, 0.28, 0.2);

    this.leftArm.rotation.set(-1.45, 0.45 + clawSwipe, 0.35);
    this.rightArm.rotation.set(-1.45, -0.45 - clawSwipe, -0.35);

    this.leftForearm.rotation.x = 0.95;
    this.rightForearm.rotation.x = 0.95;

    // Violent shivering head tremor (demonic possession stutter)
    this.head.rotation.z = (Math.random() - 0.5) * 0.25;
    this.head.rotation.x = THREE.MathUtils.lerp(0.1, -0.15, Math.min(1, progress * 3)) + (Math.random() - 0.5) * 0.15;
    this.head.rotation.y = (Math.random() - 0.5) * 0.2;

    // Blinding red eye spotlight & vivid face horror light
    this.eyeLight.intensity = 16.0 + Math.random() * 8.0;
    if (this.jumpscareFaceLight) {
      this.jumpscareFaceLight.intensity = 9.0 + Math.random() * 5.0;
    }
  }
}
