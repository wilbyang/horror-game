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

      this.keyPositions = [
        { id: 'amethyst', name: 'Void Amethyst Key', color: 0xa855f7, pos: this.gridToWorld(k1.x, k1.z), grid: k1 },
        { id: 'emerald', name: 'Soul Emerald Key', color: 0x10b981, pos: this.gridToWorld(k2.x, k2.z), grid: k2 },
        { id: 'crimson', name: 'Abyssal Eye Key', color: 0xf43f5e, pos: this.gridToWorld(k3.x, k3.z), grid: k3 },
        { id: 'infernal', name: 'Infernal Core Key', color: 0xf97316, pos: this.gridToWorld(k4.x, k4.z), grid: k4 },
        { id: 'azure', name: 'Nether Azure Key', color: 0x06b6d4, pos: this.gridToWorld(k5.x, k5.z), grid: k5 }
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

      this.keyPositions = [
        { id: 'ruby', name: 'Blood Ruby Key', color: 0xef4444, pos: this.gridToWorld(k1.x, k1.z), grid: k1 },
        { id: 'sapphire', name: 'Void Sapphire Key', color: 0x3b82f6, pos: this.gridToWorld(k2.x, k2.z), grid: k2 },
        { id: 'topaz', name: 'Elder Sun Key', color: 0xf59e0b, pos: this.gridToWorld(k3.x, k3.z), grid: k3 }
      ];
    }
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
    // Place atmospheric sconces at crossroads
    const torchSpacing = 5;
    for (let z = 3; z < s - 3; z += torchSpacing) {
      for (let x = 3; x < s - 3; x += torchSpacing) {
        if (this.grid[z][x] === 0) {
          const wPos = this.gridToWorld(x, z);

          // Wall mount
          const mountGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.4);
          const mountMat = new THREE.MeshStandardMaterial({ color: 0x221a10, metalness: 0.8 });
          const mount = new THREE.Mesh(mountGeo, mountMat);
          mount.position.set(wPos.x, 2.0, wPos.z);
          this.group.add(mount);

          // Ember bulb
          const bulbGeo = new THREE.SphereGeometry(0.1, 8, 8);
          const bulbMat = new THREE.MeshBasicMaterial({ color: (this.worldLevel === 2) ? 0xff2255 : 0xff7733 });
          const bulb = new THREE.Mesh(bulbGeo, bulbMat);
          bulb.position.set(wPos.x, 2.2, wPos.z);
          this.group.add(bulb);

          // Torchlight (Abyssal Crimson in World 2, Warm Amber in World 1)
          const torchColor = (this.worldLevel === 2) ? 0xff1844 : 0xff8833;
          const torchLight = new THREE.PointLight(torchColor, (this.worldLevel === 2) ? 2.1 : 1.8, 14.0, 1.5);
          torchLight.position.set(wPos.x, 2.3, wPos.z);
          this.group.add(torchLight);

          this.torches.push({
            light: torchLight,
            baseIntensity: (this.worldLevel === 2) ? 2.1 : 1.8,
            offset: Math.random() * 10
          });
        }
      }
    }
  }

  updateTorches(time) {
    for (const t of this.torches) {
      // Subtle organic flame flicker
      const flicker = Math.sin(time * 8 + t.offset) * 0.2 + Math.cos(time * 19 + t.offset) * 0.12;
      t.light.intensity = Math.max(1.1, t.baseIntensity + flicker);
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
