const { PNG } = require('pngjs');
const fs = require('fs');

const buf = fs.readFileSync('ChatGPT Image Jun 17, 2026, 02_03_12 PM.png');
const png = PNG.sync.read(buf);
const W = png.width, H = png.height;

let minX = W, maxX = 0, minY = H, maxY = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const idx = (y * W + x) * 4;
    const r = png.data[idx], g = png.data[idx+1], b = png.data[idx+2], a = png.data[idx+3];
    // A pixel is part of the character if it's not white/transparent
    const isWhiteOrTransparent = (a < 50) || (r > 240 && g > 240 && b > 240);
    if (!isWhiteOrTransparent) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

const cropW = maxX - minX + 1;
const cropH = maxY - minY + 1;

const gridCols = 16;
const gridRows = 16;
const cellW = cropW / gridCols;
const cellH = cropH / gridRows;

console.log('// Hand-painted 16x16 pixel grid');
console.log('const gridData = [');
for (let row = 0; row < gridRows; row++) {
  let line = '  [';
  for (let col = 0; col < gridCols; col++) {
    const px = Math.floor(minX + col * cellW + cellW / 2);
    const py = Math.floor(minY + row * cellH + cellH / 2);
    const idx = (py * W + px) * 4;
    const r = png.data[idx], g = png.data[idx+1], b = png.data[idx+2], a = png.data[idx+3];
    
    let char = ' ';
    const isWhite = (r > 240 && g > 240 && b > 240);
    if (a < 50 || isWhite) {
      // If it is inside the eye or magnifying glass area, it is W.
      // Else it's background space.
      if (row === 5 && (col === 6 || col === 7 || col === 11 || col === 12)) {
        char = 'W';
      } else if (row === 8 && col === 2) {
        char = 'W';
      } else {
        char = ' ';
      }
    } else {
      const colorsList = {
        'Y': [253, 199, 39], // beak
        'R': [241, 0, 50],   // red eye / shield
        'M': [142, 0, 48],   // body maroon
        'D': [108, 0, 40]    // outline/shadow
      };
      
      let closestChar = 'M';
      let minDist = Infinity;
      for (const [cName, rgb] of Object.entries(colorsList)) {
        const dist = Math.sqrt((r - rgb[0])**2 + (g - rgb[1])**2 + (b - rgb[2])**2);
        if (dist < minDist) {
          minDist = dist;
          closestChar = cName;
        }
      }
      char = closestChar;
    }
    line += `'${char}',`;
  }
  line += '], // Row ' + String(row).padStart(2, '0');
  console.log(line);
}
console.log('];');
