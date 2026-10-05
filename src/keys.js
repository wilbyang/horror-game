import * as THREE from 'three';
import { TextureGenerator } from './textures.js';
import { CELL_SIZE, WALL_HEIGHT } from './maze.js';

export class KeyItem {
  constructor(info) {
    this.id = info.id;
    this.name = info.name;
    this.colorHex = info.color;
    this.pos = (info.pos && typeof info.pos.clone === 'function')
      ? info.pos.clone()
      : new THREE.Vector3(info.pos.x, info.pos.y || 0, info.pos.z);
    this.pos.y = 1.3; // Floating waist height

    this.collected = false;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);

    this.buildMesh();
  }

  buildMesh() {
    // Ornate 3D Key Model
    const keyMat = new THREE.MeshStandardMaterial({
      color: this.colorHex,
      emissive: this.colorHex,
      emissiveIntensity: 0.6,
      metalness: 0.9,
      roughness: 0.2
    });

    // Key Ring / Bow
    const ringGeo = new THREE.TorusGeometry(0.2, 0.04, 16, 32);
    const ring = new THREE.Mesh(ringGeo, keyMat);
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);

    // Key Gem / Jewel inside ring
    const gemGeo = new THREE.OctahedronGeometry(0.12, 0);
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: this.colorHex,
      emissiveIntensity: 1.5,
      roughness: 0.1,
      metalness: 0.1
    });
    const gem = new THREE.Mesh(gemGeo, gemMat);
    this.group.add(gem);

    // Key Shaft
    const shaftGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.6, 12);
    const shaft = new THREE.Mesh(shaftGeo, keyMat);
    shaft.position.y = -0.38;
    this.group.add(shaft);

    // Key Bit / Teeth
    const tooth1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.04), keyMat);
    tooth1.position.set(0.08, -0.58, 0);
    this.group.add(tooth1);

    const tooth2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.04), keyMat);
    tooth2.position.set(0.1, -0.48, 0);
    this.group.add(tooth2);

    // Powerful glowing point light to illuminate long corridors
    this.light = new THREE.PointLight(this.colorHex, 4.8, 26.0, 1.2);
    this.group.add(this.light);

    // Vertical ethereal light beacon column from floor to ceiling
    const beaconGeo = new THREE.CylinderGeometry(0.15, 0.48, WALL_HEIGHT, 16, 1, true);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: this.colorHex,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    this.beaconMesh.position.y = (WALL_HEIGHT / 2) - this.pos.y;
    this.group.add(this.beaconMesh);

    // Floor runic circle
    const runeFloor = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.4, 32),
      new THREE.MeshBasicMaterial({ color: this.colorHex, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
    );
    runeFloor.position.y = -this.pos.y + 0.05;
    runeFloor.rotation.x = -Math.PI / 2;
    this.group.add(runeFloor);
    this.runeFloor = runeFloor;

    // Floating pedestal/altar beneath the key
    const pedestalGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.65, 8);
    const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x181820, roughness: 0.9 });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = -0.95;
    this.group.add(pedestal);

    // Altar runic ring
    const runeRingGeo = new THREE.RingGeometry(0.48, 0.52, 24);
    const runeMat = new THREE.MeshBasicMaterial({ color: this.colorHex, side: THREE.DoubleSide });
    const runeRing = new THREE.Mesh(runeRingGeo, runeMat);
    runeRing.position.y = -0.62;
    runeRing.rotation.x = -Math.PI / 2;
    this.group.add(runeRing);
  }

  update(time) {
    if (this.collected) return;
    // Gentle floating and rotation
    this.group.rotation.y = time * 1.5;
    this.group.position.y = this.pos.y + Math.sin(time * 2.5) * 0.1;
    this.light.intensity = 4.2 + Math.sin(time * 3.5) * 0.8;

    if (this.beaconMesh) {
      this.beaconMesh.rotation.y = -time * 0.8;
      this.beaconMesh.material.opacity = 0.28 + Math.sin(time * 3) * 0.12;
    }
  }
}

export class ExitGate {
  constructor(exitPos, worldLevel = 1) {
    this.pos = (exitPos && typeof exitPos.clone === 'function')
      ? exitPos.clone()
      : new THREE.Vector3(exitPos.x, exitPos.y || 0, exitPos.z);
    this.worldLevel = worldLevel;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);

    this.isOpen = false;
    this.openProgress = 0; // 0 to 1

    this.socketLights = {};
    this.gateDoor = null;

    this.buildGate();
  }

  buildGate() {
    // Large heavy stone arch frame
    const archMat = new THREE.MeshStandardMaterial({
      color: (this.worldLevel === 2) ? 0x14050a : 0x121218,
      roughness: 0.95
    });

    // Left pillar
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, WALL_HEIGHT, 0.8), archMat);
    p1.position.set(-CELL_SIZE / 2 + 0.4, WALL_HEIGHT / 2, 0);
    this.group.add(p1);

    // Right pillar
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, WALL_HEIGHT, 0.8), archMat);
    p2.position.set(CELL_SIZE / 2 - 0.4, WALL_HEIGHT / 2, 0);
    this.group.add(p2);

    // Top lintel
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE, 0.8, 0.8), archMat);
    lintel.position.set(0, WALL_HEIGHT - 0.4, 0);
    this.group.add(lintel);

    // Emergency Exit Sign
    const signGeo = new THREE.BoxGeometry(1.6, 0.4, 0.15);
    const signMat = new THREE.MeshStandardMaterial({
      color: (this.worldLevel === 2) ? 0x990022 : 0x880000,
      emissive: (this.worldLevel === 2) ? 0x660011 : 0x660000,
      emissiveIntensity: 0.8
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, WALL_HEIGHT - 0.4, 0.45);
    this.group.add(sign);

    // Emergency red beacon light
    const beaconCol = (this.worldLevel === 2) ? 0xff0044 : 0xff1111;
    this.beaconLight = new THREE.PointLight(beaconCol, 1.4, 12, 1.8);
    this.beaconLight.position.set(0, WALL_HEIGHT - 0.3, 0.6);
    this.group.add(this.beaconLight);

    // Heavy iron portcullis gate door
    const gateGeo = new THREE.BoxGeometry(CELL_SIZE - 0.9, WALL_HEIGHT - 0.6, 0.15);
    const gateTex = TextureGenerator.createGateTexture();
    gateTex.repeat.set(2, 2);
    const gateMat = new THREE.MeshStandardMaterial({
      map: gateTex,
      metalness: 0.85,
      roughness: 0.3
    });
    this.gateDoor = new THREE.Mesh(gateGeo, gateMat);
    this.gateDoor.position.set(0, (WALL_HEIGHT - 0.6) / 2, 0);
    this.group.add(this.gateDoor);

    // Altar pedestal with Key Receptacles in front of the gate
    const altarWidth = (this.worldLevel === 2) ? 3.2 : 2.4;
    const altar = new THREE.Mesh(
      new THREE.BoxGeometry(altarWidth, 0.9, 0.5),
      new THREE.MeshStandardMaterial({
        color: (this.worldLevel === 2) ? 0x180510 : 0x181824,
        roughness: 0.8
      })
    );
    altar.position.set(0, 0.45, 1.2);
    this.group.add(altar);

    // Socket gems (3 for World 1, 5 for World 2)
    const sockets = (this.worldLevel === 2) ? [
      { id: 'amethyst', x: -1.0, color: 0xa855f7 },
      { id: 'emerald', x: -0.5, color: 0x10b981 },
      { id: 'crimson', x: 0, color: 0xf43f5e },
      { id: 'infernal', x: 0.5, color: 0xf97316 },
      { id: 'azure', x: 1.0, color: 0x06b6d4 }
    ] : [
      { id: 'ruby', x: -0.7, color: 0xef4444 },
      { id: 'sapphire', x: 0, color: 0x3b82f6 },
      { id: 'topaz', x: 0.7, color: 0xf59e0b }
    ];

    sockets.forEach(s => {
      // Receptacle base
      const sRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.18, 0.1, 16),
        new THREE.MeshStandardMaterial({ color: 0x333340, metalness: 0.8 })
      );
      sRing.position.set(s.x, 0.92, 1.2);
      this.group.add(sRing);

      // Socket jewel (starts unlit dark stone)
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.09, 0),
        new THREE.MeshStandardMaterial({
          color: 0x222228,
          emissive: 0x000000,
          emissiveIntensity: 0,
          metalness: 0.8
        })
      );
      gem.position.set(s.x, 0.98, 1.2);
      this.group.add(gem);

      // Socket light (initially off)
      const light = new THREE.PointLight(s.color, 0, 3, 2);
      light.position.set(s.x, 1.2, 1.2);
      this.group.add(light);

      this.socketLights[s.id] = { gem, light, color: s.color, activated: false };
    });

    // Escape gateway tunnel / portal beyond the gate
    const portalGeo = new THREE.PlaneGeometry(CELL_SIZE - 1.0, WALL_HEIGHT - 0.8);
    const portalMat = new THREE.MeshBasicMaterial({
      color: (this.worldLevel === 2) ? 0xa855f7 : 0x00ff88,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });
    this.portalMesh = new THREE.Mesh(portalGeo, portalMat);
    this.portalMesh.position.set(0, (WALL_HEIGHT - 0.8) / 2, -0.3);
    this.group.add(this.portalMesh);
  }

  insertKey(keyId) {
    if (this.socketLights[keyId]) {
      const s = this.socketLights[keyId];
      s.activated = true;
      s.gem.material.color.setHex(s.color);
      s.gem.material.emissive.setHex(s.color);
      s.gem.material.emissiveIntensity = 2.0;
      s.light.intensity = 1.8;
    }
  }

  unlock() {
    this.isOpen = true;
    this.beaconLight.color.setHex(0x10b981);
  }

  update(delta, time) {
    // Pulse beacon light
    const pulse = Math.sin(time * 6) * 0.4 + 0.8;
    if (!this.isOpen) {
      this.beaconLight.intensity = pulse * 1.5;
    } else {
      this.beaconLight.intensity = 2.5;
      this.portalMesh.material.opacity = Math.min(0.7, this.portalMesh.material.opacity + delta * 0.5);

      // Gate lifting animation
      if (this.openProgress < 1.0) {
        this.openProgress = Math.min(1.0, this.openProgress + delta * 0.45);
        this.gateDoor.position.y = (WALL_HEIGHT - 0.6) / 2 + this.openProgress * (WALL_HEIGHT - 0.2);
      }
    }

    // Socket jewel breathing
    for (const key in this.socketLights) {
      const s = this.socketLights[key];
      if (s.activated) {
        s.light.intensity = 1.5 + Math.sin(time * 4) * 0.3;
      }
    }
  }
}
