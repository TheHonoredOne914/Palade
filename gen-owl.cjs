const { PNG } = require('pngjs');
const fs = require('fs');

const buf = fs.readFileSync('ChatGPT Image Jun 16, 2026, 08_56_57 PM.png');
const png = PNG.sync.read(buf);
const W = png.width;
const H = png.height;

// Find bounding box of non-background pixels (handles both black and white bg)
let minX = W, maxX = 0, minY = H, maxY = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const idx = (y * W + x) * 4;
    const r = png.data[idx], g = png.data[idx+1], b = png.data[idx+2];
    const isBg = (r > 240 && g > 240 && b > 240) || (r < 15 && g < 15 && b < 15) || (Math.abs(r-g) < 10 && Math.abs(g-b) < 10 && r > 100 && r < 150);
    if (!isBg) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

minX = Math.max(0, minX - 2);
minY = Math.max(0, minY - 2);
maxX = Math.min(W - 1, maxX + 2);
maxY = Math.min(H - 1, maxY + 2);

const cropW = maxX - minX + 1;
const cropH = maxY - minY + 1;
console.log('Image:', W, 'x', H);
console.log('Crop:', cropW, 'x', cropH);

// Half-block rows = TARGET_ROWS, pixel rows = TARGET_ROWS * 2
const TARGET_ROWS = 7;
const TARGET_COLS = 14;
const pixelRows = TARGET_ROWS * 2; // 14

const scaleX = cropW / TARGET_COLS;
const scaleY = cropH / pixelRows;

function sample(targetX, targetY) {
  const sx = Math.min(W - 1, Math.max(0, Math.round(minX + targetX * scaleX)));
  const sy = Math.min(H - 1, Math.max(0, Math.round(minY + targetY * scaleY)));
  const idx = (sy * W + sx) * 4;
  return [png.data[idx], png.data[idx+1], png.data[idx+2]];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => Math.min(255, Math.max(0, c)).toString(16).padStart(2, '0')).join('');
}

function isBackground(r, g, b) {
  if (r < 15 && g < 15 && b < 15) return true;
  if (r > 240 && g > 240 && b > 240) return true;
  // Grey background (ChatGPT images use ~125,126,126)
  if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && r > 100 && r < 150) return true;
  return false;
}

function isBlack(r, g, b) {
  return isBackground(r, g, b);
}

function colorScore(r, g, b) {
  if (isBackground(r, g, b)) return 0;
  return r + g + b;
}

// Sample multiple points in cell, pick most colorful (non-black) pixel
function sampleCell(px, py) {
  const x0 = Math.round(minX + px * scaleX);
  const y0 = Math.round(minY + py * scaleY);
  const x1 = Math.min(W - 1, Math.round(minX + (px + 1) * scaleX) - 1);
  const y1 = Math.min(H - 1, Math.round(minY + (py + 1) * scaleY) - 1);

  let best = [0, 0, 0];
  let bestScore = 0;

  // Sample grid of points within the cell
  const stepX = Math.max(1, Math.floor((x1 - x0) / 3));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 3));

  for (let sy = y0; sy <= y1; sy += stepY) {
    for (let sx = x0; sx <= x1; sx += stepX) {
      const idx = (sy * W + sx) * 4;
      const r = png.data[idx], g = png.data[idx+1], b = png.data[idx+2];
      const s = colorScore(r, g, b);
      if (s > bestScore) {
        bestScore = s;
        best = [r, g, b];
      }
    }
  }

  // Also check corners and center for edge detail
  const points = [
    [x0, y0], [x1, y0], [x0, y1], [x1, y1],
    [Math.floor((x0+x1)/2), Math.floor((y0+y1)/2)]
  ];
  for (const [sx, sy] of points) {
    const idx = (sy * W + sx) * 4;
    const r = png.data[idx], g = png.data[idx+1], b = png.data[idx+2];
    const s = colorScore(r, g, b);
    if (s > bestScore) {
      bestScore = s;
      best = [r, g, b];
    }
  }

  return best;
}

function mapColor(r, g, b) {
  if (isBlack(r, g, b)) return [0, 0, 0];
  // Yellow beak
  if (r > 150 && g > 120 && b < 100) return [255, 180, 0];
  
  // Bright red (glasses frames outer ring)
  if (r > 220 && g < 60 && b < 60) return [255, 50, 50];
  // Medium red (glasses inner, body highlights)
  if (r > 160 && r <= 220 && g < 60 && b < 60) return [240, 40, 40];
  // Dark red (body, glasses shadow)
  if (r > 100 && r <= 160 && g < 50 && b > 20 && b < 80) return [210, 20, 30];
  // Maroon (body main)
  if (r > 60 && r <= 100 && g < 30 && b > 15 && b < 60) return [170, 10, 20];
  // Very dark maroon (body shadow, edges)
  if (r > 30 && r <= 60 && g < 15 && b < 30) return [120, 5, 10];
  // Near-black (pupils, deep shadows)
  if (r > 10 && r <= 30 && g < 10 && b < 15) return [25, 2, 5];
  
  // Catch-all for other non-black colors (like white eyes)
  return [r, g, b];
}

// Build pixel grid
const grid = [];
for (let py = 0; py < pixelRows; py++) {
  const row = [];
  for (let px = 0; px < TARGET_COLS; px++) {
    const [r, g, b] = sampleCell(px, py);
    const [mr, mg, mb] = mapColor(r, g, b);
    row.push({ r: mr, g: mg, b: mb });
  }
  grid.push(row);
}

// Pair into half-blocks (TARGET_ROWS rows)
const OWL_DATA = [];
for (let row = 0; row < pixelRows; row += 2) {
  const line = [];
  for (let col = 0; col < TARGET_COLS; col++) {
    const top = grid[row][col];
    const bottom = row + 1 < pixelRows ? grid[row + 1][col] : { r: 0, g: 0, b: 0 };
    const transparent = isBlack(top.r, top.g, top.b) && isBlack(bottom.r, bottom.g, bottom.b);
    line.push({
      fg: rgbToHex(top.r, top.g, top.b),
      bg: rgbToHex(bottom.r, bottom.g, bottom.b),
      transparent
    });
  }
  OWL_DATA.push(line);
}

let ts = 'export const OWL_ART_DATA: { fg: string; bg: string; transparent?: boolean }[][] = [\n';
for (const line of OWL_DATA) {
  const cells = line.map(c => `{fg:"${c.fg}",bg:"${c.bg}",transparent:${c.transparent}}`).join(',');
  ts += `  [${cells}],\n`;
}
ts += ']\n';

fs.writeFileSync('src/ui/owl-art-data.ts', ts);
console.log('Output:', TARGET_COLS, 'x', OWL_DATA.length, 'half-block chars');
