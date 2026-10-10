import * as THREE from 'three';
import { TextureGenerator } from './textures.js';

export const CELL_SIZE = 4.0;
export const WALL_HEIGHT = 3.6;

export class Maze {
  constructor(size = 29, worldLevel = 1) {
    // Ensure size is odd
    this.size = (size % 2 === 0) ? size + 1 : size;
    this.worldLevel = worldLevel;
    this.grid = []; // 1 = wall, 0 = open path
    this.spawnPos = new THREE.Vector3();
    this.exitPos = new THREE.Vector3();
    this.keyPositions = []; // 3 key locations

    this.group = new THREE.Group();
    this.wallMesh = null;
    this.pillarMesh = null;
    this.torches = [];

    this.generate();
  }

  generate() {
    const s = this.size;
    // 1 = wall, 0 = path
    this.grid = Array.from({ length: s }, () => Array(s).fill(1));

    // Recursive Backtracker algorithm for perfect maze
    const stack = [];
    const startX = 1;
    const startZ = 1;

    this.grid[startZ][startX] = 0;
    stack.push([startX, startZ]);

    const dirs = [
      [0, -2], // North
      [0, 2],  // South
      [-2, 0], // West
      [2, 0]   // East
    ];

    while (stack.length > 0) {
      const [cx, cz] = stack[stack.length - 1];
      const neighbors = [];

      for (const [dx, dz] of dirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx > 0 && nx < s - 1 && nz > 0 && nz < s - 1 && this.grid[nz][nx] === 1) {
          neighbors.push([nx, nz, cx + dx / 2, cz + dz / 2]);
        }
      }

      if (neighbors.length > 0) {
        // Pick random neighbor
        const [nx, nz, wx, wz] = neighbors[Math.floor(Math.random() * neighbors.length)];
        this.grid[wz][wx] = 0;
        this.grid[nz][nx] = 0;
        stack.push([nx, nz]);
      } else {
        stack.pop();
      }
    }

    // Braiding: remove dead-ends to create loops for intense horror chases
    for (let z = 1; z < s - 1; z += 2) {
      for (let x = 1; x < s - 1; x += 2) {
        if (this.grid[z][x] === 0) {
          // Check how many open neighbors
          let openNeighbors = 0;
          const closedWalls = [];
          for (const [dx, dz] of dirs) {
            const wx = x + dx / 2;
            const wz = z + dz / 2;
            const nx = x + dx;
            const nz = z + dz;
            if (nx > 0 && nx < s - 1 && nz > 0 && nz < s - 1) {
              if (this.grid[wz][wx] === 0) {
                openNeighbors++;
              } else {
                closedWalls.push([wx, wz]);
              }
            }
          }

          // If dead-end (only 1 open neighbor) or with 20% random chance, open a wall
          if ((openNeighbors <= 1 && closedWalls.length > 0) || (Math.random() < 0.18 && closedWalls.length > 0)) {
            const [wx, wz] = closedWalls[Math.floor(Math.random() * closedWalls.length)];
            this.grid[wz][wx] = 0;
          }
        }
      }
    }

    // Create Spawn Area (3x3 open room near center)
    const mid = Math.floor(s / 2);
    const midOdd = (mid % 2 === 0) ? mid + 1 : mid;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.grid[midOdd + dz][midOdd + dx] = 0;
      }
    }
    this.spawnPos = this.gridToWorld(midOdd, midOdd);

    // Place Exit Gate on the Southern Border
    let exitX = midOdd;
    this.grid[s - 2][exitX] = 0;
    this.grid[s - 3][exitX] = 0;
    // Set exit world position
    this.exitPos = this.gridToWorld(exitX, s - 2);

    // Find deep dead-ends / chambers for the 3 Keys in 3 separate quadrants
    this.findKeyLocations(midOdd);
  }

  findKeyLocations(midOdd) {
    const s = this.size;

    if (this.worldLevel === 2) {
      // 5 Keys for World 2: Top-Left, Top-Right, Bottom-Left, Bottom-Right, and Far Lateral/Perimeter
      const candTL = [];
      const candTR = [];
      const candBL = [];
      const candBR = [];
      const allWalkable = [];

      for (let z = 1; z < s - 1; z++) {
        for (let x = 1; x < s - 1; x++) {
          if (this.grid[z][x] === 0) {
            const distFromSpawn = Math.hypot(x - midOdd, z - midOdd);
            if (distFromSpawn > 3) {
              let wallCount = 0;
              if (this.grid[z - 1][x] === 1) wallCount++;
              if (this.grid[z + 1][x] === 1) wallCount++;
              if (this.grid[z][x - 1] === 1) wallCount++;
              if (this.grid[z][x + 1] === 1) wallCount++;

              const score = distFromSpawn + (wallCount >= 3 ? 12 : (wallCount >= 2 ? 6 : 0));
              const cand = { x, z, score };
              allWalkable.push(cand);

              if (z < midOdd && x < midOdd) candTL.push(cand);
              else if (z < midOdd && x >= midOdd) candTR.push(cand);
              else if (z >= midOdd && x < midOdd && (x !== midOdd || z < s - 3)) candBL.push(cand);
              else if (z >= midOdd && x >= midOdd && (x !== midOdd || z < s - 3)) candBR.push(cand);
            }
          }
        }
      }

      candTL.sort((a, b) => b.score - a.score);
      candTR.sort((a, b) => b.score - a.score);
      candBL.sort((a, b) => b.score - a.score);
      candBR.sort((a, b) => b.score - a.score);

      const k1 = candTL[0] || { x: 1, z: 1 };
      const k2 = candTR[0] || { x: s - 2, z: 1 };
      const k3 = candBL[0] || { x: 1, z: s - 2 };
      const k4 = candBR[0] || { x: s - 2, z: s - 2 };

      // Find 5th key location: furthest candidate from the first 4 keys
      const chosenFirstFour = [k1, k2, k3, k4];
      allWalkable.sort((a, b) => {
        const minDistA = Math.min(...chosenFirstFour.map(k => Math.hypot(a.x - k.x, a.z - k.z)));
        const minDistB = Math.min(...chosenFirstFour.map(k => Math.hypot(b.x - k.x, b.z - k.z)));
        return (minDistB * 2 + b.score) - (minDistA * 2 + a.score);
      });
      const k5 = allWalkable[0] || candTL[1] || { x: midOdd, z: 1 };

      const buildKeyPos = (id, name, color, k) => {
        const wallDir = this.findAdjacentWallDir(k.x, k.z);
        return {
          id,
          name,
          color,
          grid: k,
          wallDir,
          pos: this.gridToWorld(k.x, k.z)
        };
      };

      this.keyPositions = [
        buildKeyPos('amethyst', 'Void Amethyst Key', 0xa855f7, k1),
        buildKeyPos('emerald', 'Soul Emerald Key', 0x10b981, k2),
        buildKeyPos('crimson', 'Abyssal Eye Key', 0xf43f5e, k3),
        buildKeyPos('infernal', 'Infernal Core Key', 0xf97316, k4),
        buildKeyPos('azure', 'Nether Azure Key', 0x06b6d4, k5)
      ];
    } else {
      // 3 Keys for World 1
      const candidatesQ1 = [];
      const candidatesQ2 = [];
      const candidatesQ3 = [];

      for (let z = 1; z < s - 1; z++) {
        for (let x = 1; x < s - 1; x++) {
          if (this.grid[z][x] === 0) {
            const distFromSpawn = Math.hypot(x - midOdd, z - midOdd);
            if (distFromSpawn > 3) {
              let wallCount = 0;
              if (this.grid[z - 1][x] === 1) wallCount++;
              if (this.grid[z + 1][x] === 1) wallCount++;
              if (this.grid[z][x - 1] === 1) wallCount++;
              if (this.grid[z][x + 1] === 1) wallCount++;

              const score = distFromSpawn + (wallCount >= 3 ? 10 : 0);

              if (z < midOdd && x < midOdd) {
                candidatesQ1.push({ x, z, score });
              } else if (z < midOdd && x >= midOdd) {
                candidatesQ2.push({ x, z, score });
              } else if (z >= midOdd && (x !== midOdd || z < s - 3)) {
                candidatesQ3.push({ x, z, score });
              }
            }
          }
        }
      }

      candidatesQ1.sort((a, b) => b.score - a.score);
      candidatesQ2.sort((a, b) => b.score - a.score);
      candidatesQ3.sort((a, b) => b.score - a.score);

      const k1 = candidatesQ1[0] || { x: 1, z: 1 };
      const k2 = candidatesQ2[0] || { x: s - 2, z: 1 };
      const k3 = candidatesQ3[0] || { x: s - 2, z: s - 2 };

      const buildKeyPos = (id, name, color, k) => {
        const wallDir = this.findAdjacentWallDir(k.x, k.z);
        return {
          id,
          name,
          color,
          grid: k,
          wallDir,
          pos: this.gridToWorld(k.x, k.z)
        };
      };

      this.keyPositions = [
        buildKeyPos('ruby', 'Blood Ruby Key', 0xef4444, k1),
        buildKeyPos('sapphire', 'Void Sapphire Key', 0x3b82f6, k2),
        buildKeyPos('topaz', 'Elder Sun Key', 0xf59e0b, k3)
      ];
    }
  }

  findAdjacentWallDir(gx, gz) {
    const s = this.size;
    const dirs = [
      { dx: 0, dz: -1 }, // North
      { dx: 0, dz: 1 },  // South
      { dx: -1, dz: 0 }, // West
      { dx: 1, dz: 0 }   // East
    ];
    for (const d of dirs) {
      const nx = gx + d.dx;
      const nz = gz + d.dz;
      if (nx >= 0 && nx < s && nz >= 0 && nz < s && this.grid[nz][nx] === 1) {
        return d;
      }
    }
    return { dx: 0, dz: -1 };
  }

  build3DWorld(scene) {
    const s = this.size;
    const totalWorldSize = s * CELL_SIZE;

    // Floor
    const floorGeo = new THREE.PlaneGeometry(totalWorldSize, totalWorldSize);
    const floorTex = (this.worldLevel === 2)
      ? TextureGenerator.createAbyssalFloorTexture()
      : TextureGenerator.createFloorTexture();
    floorTex.repeat.set(s, s);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.85,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Ceiling
    const ceilingGeo = new THREE.PlaneGeometry(totalWorldSize, totalWorldSize);
    const ceilingTex = TextureGenerator.createCeilingTexture();
    ceilingTex.repeat.set(s / 2, s / 2);
    const ceilingMat = new THREE.MeshStandardMaterial({
      map: ceilingTex,
      roughness: 0.95,
      metalness: 0.05
    });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.position.y = WALL_HEIGHT;
    ceiling.rotation.x = Math.PI / 2;
    ceiling.receiveShadow = true;
    this.group.add(ceiling);

    // Walls using InstancedMesh for 60+ FPS performance!
    const wallPositions = [];
    for (let z = 0; z < s; z++) {
      for (let x = 0; x < s; x++) {
        if (this.grid[z][x] === 1) {
          wallPositions.push(this.gridToWorld(x, z));
        }
      }
    }

    const wallGeo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
    const wallTex = (this.worldLevel === 2)
      ? TextureGenerator.createAbyssalWallTexture()
      : TextureGenerator.createWallTexture();
    wallTex.repeat.set(1, 1);
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.88,
      metalness: 0.12
    });

    this.wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, wallPositions.length);
    this.wallMesh.castShadow = true;
    this.wallMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < wallPositions.length; i++) {
      const pos = wallPositions[i];
      dummy.position.set(pos.x, WALL_HEIGHT / 2, pos.z);
      dummy.updateMatrix();
      this.wallMesh.setMatrixAt(i, dummy.matrix);
    }
    this.wallMesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.wallMesh);

    // Add wall pillars/trim corners to enrich visuals
    this.addPillarsAndDetails();

    // Add Blood Graffiti Decals on select walls
    this.addBloodDecals();

    // Add Dim Flickering Torches at select intersections
    this.addTorches();

    scene.add(this.group);
  }

  addPillarsAndDetails() {
    const pillarGeo = new THREE.BoxGeometry(0.55, WALL_HEIGHT + 0.1, 0.55);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.9 });
    const pillarPositions = [];

    const s = this.size;
    for (let z = 0; z <= s; z++) {
      for (let x = 0; x <= s; x++) {
        // Add decorative pillar at wall corners
        const wPos = this.gridToWorld(x - 0.5, z - 0.5);
        pillarPositions.push(wPos);
      }
    }

    const pillarMesh = new THREE.InstancedMesh(pillarGeo, pillarMat, pillarPositions.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < pillarPositions.length; i++) {
      dummy.position.set(pillarPositions[i].x, WALL_HEIGHT / 2, pillarPositions[i].z);
      dummy.updateMatrix();
      pillarMesh.setMatrixAt(i, dummy.matrix);
    }
    pillarMesh.instanceMatrix.needsUpdate = true;
    this.group.add(pillarMesh);
  }

  addBloodDecals() {
    const decalTexts = (this.worldLevel === 2) ? [
      'IT RUNS FASTER THAN YOU',
      'THE APEX HUNTS',
      'STAMINA WILL FAIL YOU',
      'HEAR ITS TALONS',
      'NO ESCAPE FROM ABYSS',
      'DO NOT STOP'
    ] : [
      'FIND 3 KEYS',
      'HE HEARS SPRINTING',
      'DONT LOOK BACK',
      'SOUTH EXIT GATE',
      'FLASHLIGHT STUNS HIM',
      'NO ESCAPE'
    ];

    const planeGeo = new THREE.PlaneGeometry(2.4, 1.2);

    for (let i = 0; i < decalTexts.length; i++) {
      const decalTex = TextureGenerator.createBloodDecalTexture(decalTexts[i]);
      const mat = new THREE.MeshBasicMaterial({
        map: decalTex,
        transparent: true,
        opacity: 0.85,
        depthWrite: false
      });

      // Find an open wall surface
      let placed = false;
      for (let attempts = 0; attempts < 30; attempts++) {
        const x = 2 + Math.floor(Math.random() * (this.size - 4));
        const z = 2 + Math.floor(Math.random() * (this.size - 4));

        if (this.grid[z][x] === 0 && this.grid[z - 1][x] === 1) {
          const mesh = new THREE.Mesh(planeGeo, mat);
          const wPos = this.gridToWorld(x, z);
          mesh.position.set(wPos.x, 1.7, wPos.z - CELL_SIZE / 2 + 0.05);
          mesh.rotation.y = 0;
          this.group.add(mesh);
          placed = true;
          break;
        }
      }
    }
  }

  addTorches() {
    const s = this.size;
    const candidateDirs = [
      { dx: 0, dz: -1 }, // North
      { dx: 0, dz: 1 },  // South
      { dx: -1, dz: 0 }, // West
      { dx: 1, dz: 0 }   // East
    ];

    // Shared materials for all wall sconces - gunmetal iron with visible highlights
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x2e303b,
      metalness: 0.85,
      roughness: 0.35
    });

    const rivetMat = new THREE.MeshStandardMaterial({
      color: 0x585c6d,
      metalness: 0.9,
      roughness: 0.2
    });

    const backplateWoodMat = new THREE.MeshStandardMaterial({
      color: (this.worldLevel === 2) ? 0x240e14 : 0x3a281a,
      roughness: 0.9,
      metalness: 0.05
    });

    const woodMat = new THREE.MeshStandardMaterial({
      color: (this.worldLevel === 2) ? 0x1f1412 : 0x4a3220,
      roughness: 0.85,
      metalness: 0.1
    });

    const wrapMat = new THREE.MeshStandardMaterial({
      color: (this.worldLevel === 2) ? 0x26080e : 0x1e1711,
      roughness: 0.95
    });

    const flameMat = new THREE.MeshBasicMaterial({
      color: (this.worldLevel === 2) ? 0xff2255 : 0xff9922
    });

    const flameCoreMat = new THREE.MeshBasicMaterial({
      color: (this.worldLevel === 2) ? 0xff88aa : 0xffe066
    });

    const torchSpacing = 5;
    const placedWallSpots = new Set();

    for (let z = 3; z < s - 3; z += torchSpacing) {
      for (let x = 3; x < s - 3; x += torchSpacing) {
        // Find a walkable corridor cell near (x, z) that has an adjacent wall
        let targetX = -1, targetZ = -1, wallDir = null;

        for (let rz = -1; rz <= 1 && !wallDir; rz++) {
          for (let rx = -1; rx <= 1 && !wallDir; rx++) {
            const cx = x + rx;
            const cz = z + rz;
            if (cx >= 1 && cx < s - 1 && cz >= 1 && cz < s - 1 && this.grid[cz][cx] === 0) {
              const foundWall = candidateDirs.find(d => {
                const nx = cx + d.dx;
                const nz = cz + d.dz;
                return nx >= 0 && nx < s && nz >= 0 && nz < s && this.grid[nz][nx] === 1;
              });
              if (foundWall) {
                targetX = cx;
                targetZ = cz;
                wallDir = foundWall;
              }
            }
          }
        }

        if (wallDir && targetX !== -1) {
          const wPos = this.gridToWorld(targetX, targetZ);
          const wallX = wPos.x + wallDir.dx * (CELL_SIZE / 2);
          const wallZ = wPos.z + wallDir.dz * (CELL_SIZE / 2);
          const spotKey = `${Math.round(wallX)},${Math.round(wallZ)}`;

          if (placedWallSpots.has(spotKey)) continue;
          placedWallSpots.add(spotKey);

          const sconceGroup = new THREE.Group();
          sconceGroup.position.set(wallX, 1.95, wallZ);
          sconceGroup.rotation.y = Math.atan2(-wallDir.dx, -wallDir.dz);

          // 1. Heavy Wooden Shield Wall Plate (sits flush against stone wall face)
          const backplateGeo = new THREE.BoxGeometry(0.34, 0.92, 0.06);
          const backplate = new THREE.Mesh(backplateGeo, backplateWoodMat);
          backplate.position.set(0, 0, 0.02);
          sconceGroup.add(backplate);

          // 2. Central Forged Iron Spine Strip extending along wall plate
          const spineGeo = new THREE.BoxGeometry(0.10, 1.08, 0.05);
          const spine = new THREE.Mesh(spineGeo, ironMat);
          spine.position.set(0, 0, 0.05);
          sconceGroup.add(spine);

          // Top and Bottom Forged Iron Wall Clamps
          const clampGeo = new THREE.BoxGeometry(0.36, 0.08, 0.06);
          const clampTop = new THREE.Mesh(clampGeo, ironMat);
          clampTop.position.set(0, 0.35, 0.05);
          sconceGroup.add(clampTop);

          const clampBottom = new THREE.Mesh(clampGeo, ironMat);
          clampBottom.position.set(0, -0.35, 0.05);
          sconceGroup.add(clampBottom);

          // 4 Large Highlighted Steel Studs/Rivets on Wall Clamps
          const rivetGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8);
          [
            [-0.13, 0.35], [0.13, 0.35],
            [-0.13, -0.35], [0.13, -0.35]
          ].forEach(([rx, ry]) => {
            const rivet = new THREE.Mesh(rivetGeo, rivetMat);
            rivet.rotation.x = Math.PI / 2;
            rivet.position.set(rx, ry, 0.075);
            sconceGroup.add(rivet);
          });

          // 3. Thick Forged Iron Support Arm anchored to wall spine
          const armGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8);
          const arm = new THREE.Mesh(armGeo, ironMat);
          arm.rotation.x = Math.PI / 2;
          arm.position.set(0, 0.02, 0.11);
          sconceGroup.add(arm);

          // Heavy 45-degree Diagonal Support Strut from wall plate to torch cup
          const braceGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.22, 8);
          const brace = new THREE.Mesh(braceGeo, ironMat);
          brace.rotation.x = -Math.PI / 4;
          brace.position.set(0, -0.09, 0.09);
          sconceGroup.add(brace);

          // 4. Forged Iron Sconce Cup
          const cupGeo = new THREE.CylinderGeometry(0.065, 0.045, 0.12, 8, 1, true);
          const cup = new THREE.Mesh(cupGeo, ironMat);
          cup.position.set(0, 0.06, 0.18);
          sconceGroup.add(cup);

          // 5. Wooden Torch Shaft resting inside cup
          const shaftGeo = new THREE.CylinderGeometry(0.028, 0.022, 0.42, 8);
          const shaft = new THREE.Mesh(shaftGeo, woodMat);
          shaft.rotation.x = 0.12;
          shaft.position.set(0, 0.18, 0.20);
          sconceGroup.add(shaft);

          // 6. Charred Wrapped Torch Head
          const headGeo = new THREE.CylinderGeometry(0.055, 0.042, 0.14, 8);
          const head = new THREE.Mesh(headGeo, wrapMat);
          head.rotation.x = 0.12;
          head.position.set(0, 0.34, 0.22);
          sconceGroup.add(head);

          // 7. Glowing Flame Meshes
          const flameGeo = new THREE.ConeGeometry(0.07, 0.24, 8);
          const flame = new THREE.Mesh(flameGeo, flameMat);
          flame.position.set(0, 0.48, 0.24);
          sconceGroup.add(flame);

          const coreGeo = new THREE.SphereGeometry(0.04, 8, 8);
          const flameCore = new THREE.Mesh(coreGeo, flameCoreMat);
          flameCore.position.set(0, 0.44, 0.24);
          sconceGroup.add(flameCore);

          // 8. Warm Flickering Torch Point Light (brightly washes wall plate and masonry)
          const torchColor = (this.worldLevel === 2) ? 0xff1844 : 0xff8833;
          const torchLight = new THREE.PointLight(
            torchColor,
            (this.worldLevel === 2) ? 2.3 : 1.9,
            15.0,
            1.4
          );
          torchLight.position.set(0, 0.50, 0.22);
          sconceGroup.add(torchLight);

          this.group.add(sconceGroup);

          this.torches.push({
            light: torchLight,
            flame: flame,
            flameCore: flameCore,
            baseIntensity: (this.worldLevel === 2) ? 2.3 : 1.9,
            offset: Math.random() * 10
          });
        }
      }
    }
  }

  updateTorches(time) {
    for (const t of this.torches) {
      // Subtle organic flame flicker
      const flicker = Math.sin(time * 8 + t.offset) * 0.25 + Math.cos(time * 19 + t.offset) * 0.15;
      t.light.intensity = Math.max(1.1, t.baseIntensity + flicker);
      if (t.flame) {
        t.flame.scale.y = 1.0 + flicker * 0.35;
        t.flame.scale.x = 1.0 - flicker * 0.15;
        t.flame.scale.z = 1.0 - flicker * 0.15;
      }
      if (t.flameCore) {
        t.flameCore.scale.setScalar(1.0 + flicker * 0.2);
      }
    }
  }

  // World coordinates <-> Grid coordinates
  gridToWorld(gx, gz) {
    const half = (this.size * CELL_SIZE) / 2;
    return new THREE.Vector3(
      gx * CELL_SIZE - half + CELL_SIZE / 2,
      0,
      gz * CELL_SIZE - half + CELL_SIZE / 2
    );
  }

  worldToGrid(wx, wz) {
    const half = (this.size * CELL_SIZE) / 2;
    const gx = Math.floor((wx + half) / CELL_SIZE);
    const gz = Math.floor((wz + half) / CELL_SIZE);
    return { x: gx, z: gz };
  }

  isWalkable(gx, gz) {
    if (gx < 0 || gx >= this.size || gz < 0 || gz >= this.size) return false;
    return this.grid[gz][gx] === 0;
  }

  // Circle vs Maze Wall AABB collision resolution with smooth sliding
  resolveCollision(position, radius = 0.45) {
    const half = (this.size * CELL_SIZE) / 2;
    const centerGx = Math.floor((position.x + half) / CELL_SIZE);
    const centerGz = Math.floor((position.z + half) / CELL_SIZE);

    // Check 3x3 surrounding cells
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = centerGx + dx;
        const gz = centerGz + dz;

        // Out of bounds or wall
        if (gx < 0 || gx >= this.size || gz < 0 || gz >= this.size || this.grid[gz][gx] === 1) {
          // AABB of this wall cell
          const minX = gx * CELL_SIZE - half;
          const maxX = minX + CELL_SIZE;
          const minZ = gz * CELL_SIZE - half;
          const maxZ = minZ + CELL_SIZE;

          // Closest point on AABB to circle center
          const closestX = Math.max(minX, Math.min(position.x, maxX));
          const closestZ = Math.max(minZ, Math.min(position.z, maxZ));

          const distX = position.x - closestX;
          const distZ = position.z - closestZ;
          const distSq = distX * distX + distZ * distZ;

          if (distSq < radius * radius && distSq > 0.00001) {
            const dist = Math.sqrt(distSq);
            const overlap = radius - dist;
            position.x += (distX / dist) * overlap;
            position.z += (distZ / dist) * overlap;
          }
        }
      }
    }
  }

  // Line of sight raycast against maze walls
  hasLineOfSight(posA, posB) {
    const dist = posA.distanceTo(posB);
    const stepSize = 0.5;
    const steps = Math.ceil(dist / stepSize);
    const dir = new THREE.Vector3().subVectors(posB, posA).normalize();

    for (let i = 1; i < steps; i++) {
      const checkPos = new THREE.Vector3().copy(posA).addScaledVector(dir, i * stepSize);
      const grid = this.worldToGrid(checkPos.x, checkPos.z);
      if (!this.isWalkable(grid.x, grid.z)) {
        return false; // Obstructed by wall
      }
    }
    return true;
  }

  // A* pathfinding on grid
  findPath(startWorld, endWorld) {
    const startG = this.worldToGrid(startWorld.x, startWorld.z);
    const endG = this.worldToGrid(endWorld.x, endWorld.z);

    if (!this.isWalkable(startG.x, startG.z) || !this.isWalkable(endG.x, endG.z)) {
      return [];
    }

    const key = (x, z) => `${x},${z}`;
    const openSet = [{ x: startG.x, z: startG.z, g: 0, f: Math.hypot(startG.x - endG.x, startG.z - endG.z) }];
    const cameFrom = new Map();
    const gScore = new Map();
    gScore.set(key(startG.x, startG.z), 0);

    const dirs = [
      [0, -1], [0, 1], [-1, 0], [1, 0]
    ];

    while (openSet.length > 0) {
      // Find node with lowest f score
      let lowestIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[lowestIdx].f) {
          lowestIdx = i;
        }
      }

      const current = openSet.splice(lowestIdx, 1)[0];

      if (current.x === endG.x && current.z === endG.z) {
        // Reconstruct path
        const path = [];
        let currKey = key(current.x, current.z);
        while (cameFrom.has(currKey)) {
          const [gx, gz] = currKey.split(',').map(Number);
          path.unshift(this.gridToWorld(gx, gz));
          currKey = cameFrom.get(currKey);
        }
        return path;
      }

      for (const [dx, dz] of dirs) {
        const nx = current.x + dx;
        const nz = current.z + dz;

        if (this.isWalkable(nx, nz)) {
          const nKey = key(nx, nz);
          const tentativeG = current.g + 1;

          if (!gScore.has(nKey) || tentativeG < gScore.get(nKey)) {
            cameFrom.set(nKey, key(current.x, current.z));
            gScore.set(nKey, tentativeG);
            const h = Math.hypot(nx - endG.x, nz - endG.z);
            openSet.push({ x: nx, z: nz, g: tentativeG, f: tentativeG + h });
          }
        }
      }
    }

    return []; // No path found
  }
}
