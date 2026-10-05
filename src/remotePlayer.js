import * as THREE from 'three';

export class RemotePlayer {
  constructor(scene, soundEngine, label = 'TEAMMATE') {
    this.scene = scene;
    this.sound = soundEngine;
    this.label = label;

    this.group = new THREE.Group();
    this.targetPos = new THREE.Vector3();
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.isMoving = false;
    this.isSprinting = false;
    this.isDowned = false;
    this.animTime = 0;
    this.stepTimer = 0;

    // Build 3D Survivor Model
    this.buildModel();

    // Flashlight
    this.setupFlashlight();

    // Floating Nametag
    this.createNameplate();

    this.scene.add(this.group);
  }

  buildModel() {
    // Survivor materials
    const suitMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb, // Explorer Cobalt Blue
      roughness: 0.65,
      metalness: 0.2
    });

    const vestMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.1
    });

    const visorMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8
    });

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xd4a373,
      roughness: 0.7
    });

    // Root Body
    this.body = new THREE.Group();
    this.body.position.y = 0.82;

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.5, 0.65, 0.3);
    const torso = new THREE.Mesh(torsoGeo, suitMat);
    this.body.add(torso);

    // Tactical Harness / Chest Vest
    const vestGeo = new THREE.BoxGeometry(0.54, 0.42, 0.34);
    const vest = new THREE.Mesh(vestGeo, vestMat);
    vest.position.set(0, 0.05, 0);
    this.body.add(vest);

    // Reflective Safety Stripe across chest
    const stripeGeo = new THREE.PlaneGeometry(0.52, 0.06);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(0, 0.1, 0.175);
    this.body.add(stripe);

    // Head
    this.head = new THREE.Group();
    this.head.position.set(0, 0.52, 0);

    const helmetGeo = new THREE.SphereGeometry(0.2, 12, 12);
    const helmet = new THREE.Mesh(helmetGeo, vestMat);
    this.head.add(helmet);

    // Glowing Cyan Visor
    const visorGeo = new THREE.BoxGeometry(0.24, 0.1, 0.12);
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 0.02, 0.16);
    this.head.add(visor);

    this.body.add(this.head);

    // Arms
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.35, 0.22, 0);
    const armGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.55, 8);
    const lArmMesh = new THREE.Mesh(armGeo, suitMat);
    lArmMesh.position.y = -0.22;
    this.leftArm.add(lArmMesh);
    this.body.add(this.leftArm);

    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.35, 0.22, 0);
    const rArmMesh = new THREE.Mesh(armGeo, suitMat);
    rArmMesh.position.y = -0.22;
    this.rightArm.add(rArmMesh);
    this.body.add(this.rightArm);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.65, 8);

    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.16, -0.32, 0);
    const lLegMesh = new THREE.Mesh(legGeo, vestMat);
    lLegMesh.position.y = -0.3;
    this.leftLeg.add(lLegMesh);
    this.body.add(this.leftLeg);

    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.16, -0.32, 0);
    const rLegMesh = new THREE.Mesh(legGeo, vestMat);
    rLegMesh.position.y = -0.3;
    this.rightLeg.add(rLegMesh);
    this.body.add(this.rightLeg);

    this.group.add(this.body);
  }

  setupFlashlight() {
    this.flashlightOn = true;

    // Physical flashlight prop mounted on right hand/shoulder
    const lightCaseGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.22, 8);
    const lightCaseMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9 });
    const lightCase = new THREE.Mesh(lightCaseGeo, lightCaseMat);
    lightCase.rotation.x = Math.PI / 2;
    lightCase.position.set(0.24, 0.32, 0.18);
    this.body.add(lightCase);

    // Real dynamic SpotLight illuminating the scene
    this.spotLight = new THREE.SpotLight(0xfffaea, 4.5, 34, Math.PI / 5.2, 0.45, 1.4);
    this.spotLight.position.set(0.24, 0.32, 0.18);

    this.spotTarget = new THREE.Object3D();
    this.spotTarget.position.set(0.24, 0.32, 10);

    this.body.add(this.spotLight);
    this.body.add(this.spotTarget);
    this.spotLight.target = this.spotTarget;

    // Subtle proximity aura
    this.aura = new THREE.PointLight(0xffeedd, 0.9, 6.0, 1.6);
    this.aura.position.set(0, 0.3, 0);
    this.body.add(this.aura);
  }

  createNameplate() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.roundRect(10, 10, 236, 44, 10);
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.label, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    this.nameSprite = new THREE.Sprite(spriteMat);
    this.nameSprite.position.set(0, 1.85, 0);
    this.nameSprite.scale.set(1.4, 0.35, 1);
    this.group.add(this.nameSprite);
  }

  setDowned(isDowned) {
    if (this.isDowned === isDowned) return;
    this.isDowned = isDowned;

    if (isDowned) {
      // Collapse to floor
      this.body.rotation.z = Math.PI / 2.3;
      this.body.position.y = 0.25;
      if (this.nameSprite) {
        this.nameSprite.position.set(0, 0.9, 0);
      }
      this.spotLight.intensity = 1.0;
    } else {
      // Revived back upright
      this.body.rotation.z = 0;
      this.body.position.y = 0.82;
      if (this.nameSprite) {
        this.nameSprite.position.set(0, 1.85, 0);
      }
      this.spotLight.intensity = 4.5;
    }
  }

  setFlashlight(enabled) {
    this.flashlightOn = enabled;
    this.spotLight.visible = enabled;
    this.aura.visible = enabled;
  }

  update(delta, playerPos = null) {
    // Interpolate position smoothly
    const prevPos = this.group.position.clone();
    this.group.position.lerp(this.targetPos, 0.24);

    // Interpolate rotation
    const curRotY = this.group.rotation.y;
    let diff = this.targetYaw - curRotY;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.group.rotation.y += diff * 0.22;

    // Head pitch tilt
    if (this.head) {
      this.head.rotation.x = THREE.MathUtils.lerp(this.head.rotation.x, this.targetPitch, 0.2);
    }

    // Walking animation
    const movedDist = this.group.position.distanceTo(prevPos);
    this.isMoving = (movedDist > 0.005) && !this.isDowned;

    if (this.isMoving) {
      const freq = this.isSprinting ? 14 : 9;
      this.animTime += delta * freq;
      const swing = Math.sin(this.animTime) * 0.55;

      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.8;
      this.rightArm.rotation.x = swing * 0.8;

      // Play spatial footsteps for teammate
      if (playerPos && this.sound) {
        this.stepTimer += delta;
        const stepRate = this.isSprinting ? 0.26 : 0.42;
        if (this.stepTimer >= stepRate) {
          this.stepTimer = 0;
          const dist = this.group.position.distanceTo(playerPos);
          if (dist < 28) {
            this.sound.playPlayerStep(this.isSprinting);
          }
        }
      }
    } else if (!this.isDowned) {
      // Idle pose
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, 0.15);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, 0.15);
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, 0.15);
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, 0.15);
    }
  }

  destroy() {
    this.scene.remove(this.group);
  }
}
