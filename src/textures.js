import * as THREE from 'three';

export class TextureGenerator {
  static createWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base dark stone color
    ctx.fillStyle = '#2a2b34';
    ctx.fillRect(0, 0, 512, 512);

    // Stone brick grid
    const rows = 16;
    const cols = 8;
    const rowHeight = 512 / rows;
    const colWidth = 512 / cols;

    for (let r = 0; r < rows; r++) {
      const offsetX = (r % 2 === 0) ? 0 : colWidth / 2;
      for (let c = -1; c <= cols; c++) {
        const x = c * colWidth + offsetX;
        const y = r * rowHeight;

        // Random subtle brick tint
        const shade = 48 + Math.floor(Math.random() * 24);
        ctx.fillStyle = `rgb(${shade}, ${shade - 2}, ${shade + 4})`;
        ctx.fillRect(x + 2, y + 2, colWidth - 4, rowHeight - 4);

        // Brick surface noise
        for (let i = 0; i < 30; i++) {
          const px = x + 3 + Math.random() * (colWidth - 6);
          const py = y + 3 + Math.random() * (rowHeight - 6);
          const noiseShade = shade + (Math.random() * 24 - 12);
          ctx.fillStyle = `rgb(${noiseShade}, ${noiseShade}, ${noiseShade})`;
          ctx.fillRect(px, py, 2, 2);
        }
      }
    }

    // Mortar lines
    ctx.strokeStyle = '#0a0a0d';
    ctx.lineWidth = 3;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * rowHeight);
      ctx.lineTo(512, r * rowHeight);
      ctx.stroke();
    }
    for (let r = 0; r < rows; r++) {
      const offsetX = (r % 2 === 0) ? 0 : colWidth / 2;
      for (let c = -1; c <= cols; c++) {
        const x = c * colWidth + offsetX;
        ctx.beginPath();
        ctx.moveTo(x, r * rowHeight);
        ctx.lineTo(x, (r + 1) * rowHeight);
        ctx.stroke();
      }
    }

    // Damp green/moss stains along bottom
    const mossGrad = ctx.createLinearGradient(0, 420, 0, 512);
    mossGrad.addColorStop(0, 'rgba(10, 25, 15, 0)');
    mossGrad.addColorStop(1, 'rgba(15, 45, 20, 0.45)');
    ctx.fillStyle = mossGrad;
    ctx.fillRect(0, 420, 512, 92);

    // Dark grime drips
    ctx.fillStyle = 'rgba(5, 5, 8, 0.4)';
    for (let d = 0; d < 8; d++) {
      const dx = Math.random() * 512;
      const dlen = 40 + Math.random() * 120;
      ctx.fillRect(dx, 0, 3 + Math.random() * 4, dlen);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  static createFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Damp dark flagstones
    ctx.fillStyle = '#22232c';
    ctx.fillRect(0, 0, 512, 512);

    const gridSize = 64;
    for (let x = 0; x < 512; x += gridSize) {
      for (let y = 0; y < 512; y += gridSize) {
        const v = 38 + Math.floor(Math.random() * 20);
        ctx.fillStyle = `rgb(${v}, ${v + 1}, ${v + 4})`;
        ctx.fillRect(x + 2, y + 2, gridSize - 4, gridSize - 4);

        // Cracks
        if (Math.random() > 0.4) {
          ctx.strokeStyle = '#08080a';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x + 5, y + 5);
          ctx.lineTo(x + gridSize * 0.4, y + gridSize * 0.5);
          ctx.lineTo(x + gridSize - 8, y + gridSize * 0.7);
          ctx.stroke();
        }
      }
    }

    // Flagstone joints
    ctx.strokeStyle = '#07070a';
    ctx.lineWidth = 4;
    for (let i = 0; i <= 512; i += gridSize) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    // Dirty wet puddle spots
    for (let p = 0; p < 4; p++) {
      const px = 60 + Math.random() * 390;
      const py = 60 + Math.random() * 390;
      const rad = 25 + Math.random() * 45;
      const puddleGrad = ctx.createRadialGradient(px, py, 5, px, py, rad);
      puddleGrad.addColorStop(0, 'rgba(8, 12, 16, 0.7)');
      puddleGrad.addColorStop(1, 'rgba(8, 12, 16, 0)');
      ctx.fillStyle = puddleGrad;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  static createCeilingTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1c1c24';
    ctx.fillRect(0, 0, 256, 256);

    // Rough rocky texture noise
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const s = 24 + Math.floor(Math.random() * 20);
      ctx.fillStyle = `rgb(${s}, ${s}, ${s})`;
      ctx.fillRect(x, y, 4, 4);
    }

    // Heavy beams
    ctx.fillStyle = '#16100a';
    ctx.fillRect(0, 110, 256, 36);
    ctx.strokeStyle = '#080503';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 110, 256, 36);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  static createGateTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Rusty iron metal
    ctx.fillStyle = '#1a1816';
    ctx.fillRect(0, 0, 256, 256);

    // Rust specks
    for (let i = 0; i < 300; i++) {
      const rx = Math.random() * 256;
      const ry = Math.random() * 256;
      ctx.fillStyle = (Math.random() > 0.5) ? 'rgba(139, 45, 20, 0.4)' : 'rgba(80, 40, 20, 0.5)';
      ctx.fillRect(rx, ry, 3, 3);
    }

    // Vertical heavy iron bars
    ctx.strokeStyle = '#0a0a0b';
    ctx.lineWidth = 14;
    for (let x = 20; x < 256; x += 42) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();

      // Highlight on bar edge
      ctx.strokeStyle = 'rgba(180, 160, 140, 0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 5, 0);
      ctx.lineTo(x - 5, 256);
      ctx.stroke();
      ctx.strokeStyle = '#0a0a0b';
      ctx.lineWidth = 14;
    }

    // Horizontal cross reinforcements
    ctx.fillStyle = '#121214';
    ctx.fillRect(0, 50, 256, 24);
    ctx.fillRect(0, 180, 256, 24);

    // Rivets
    for (let x = 20; x < 256; x += 42) {
      ctx.fillStyle = '#3a3835';
      ctx.beginPath();
      ctx.arc(x, 62, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, 192, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  static createBloodDecalTexture(text = 'HE HEARS YOU') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 512, 256);

    // Bloody dripping scribbles
    ctx.font = 'bold 36px "Cinzel", "Courier New", monospace';
    ctx.fillStyle = 'rgba(140, 10, 10, 0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = 'rgba(70, 0, 0, 0.9)';
    ctx.shadowBlur = 8;
    ctx.fillText(text, 256, 110);

    // Drips below letters
    ctx.fillStyle = 'rgba(120, 8, 8, 0.85)';
    for (let i = 0; i < 18; i++) {
      const dx = 100 + Math.random() * 312;
      const dlen = 10 + Math.random() * 60;
      ctx.fillRect(dx, 125, 2 + Math.random() * 2, dlen);
      // droplet
      ctx.beginPath();
      ctx.arc(dx + 1, 125 + dlen + 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Handprint splatters
    for (let s = 0; s < 12; s++) {
      const sx = 60 + Math.random() * 390;
      const sy = 40 + Math.random() * 160;
      ctx.beginPath();
      ctx.arc(sx, sy, 3 + Math.random() * 5, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  static createKeyGlowTexture(colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, colorHex);
    grad.addColorStop(0.3, colorHex.replace('1)', '0.5)'));
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }
}
