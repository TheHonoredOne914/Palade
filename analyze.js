const { PNG } = require('pngjs');
const fs = require('fs');

const buf = fs.readFileSync('ChatGPT Image Jun 16, 2026, 08_56_57 PM.png');
const png = PNG.sync.read(buf);
const W = png.width, H = png.height;

// Let's find the bounding box
let minX = W, maxX = 0, minY = H, maxY = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const idx = (y * W + x) * 4;
    const r = png.data[idx], g = png.data[idx+1], b = png.data[idx+2], a = png.data[idx+3];
    // Background is white (r > 240, g > 240, b > 240)
    const isBg = r > 240 && g > 240 && b > 240;
    if (!isBg && a > 0) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

console.log(`Bounds: X(${minX}..${maxX}), Y(${minY}..${maxY})`);
console.log(`Size: ${maxX - minX + 1}x${maxY - minY + 1}`);

// Now let's sample the grid. The owl is exactly 14x16 pixels?
// Let's divide the bounding box into a 14x16 grid and find the dominant color in each cell.
const gridCols = 14;
const gridRows = 16;

const cellW = (maxX - minX + 1) / gridCols;
const cellH = (maxY - minY + 1) / gridRows;

for (let row = 0; row < gridRows; row++) {
  let line = '';
  for (let col = 0; col < gridCols; col++) {
    // Find the pixel in the center of this cell
    const px = Math.floor(minX + col * cellW + cellW / 2);
    const py = Math.floor(minY + row * cellH + cellH / 2);
    const idx = (py * W + px) * 4;
    const r = png.data[idx], g = png.data[idx+1], b = png.data[idx+2];
    
    // Categorize
    if (r > 240 && g > 240 && b > 240) {
      line += ' '; // Background
    } else if (r > 240 && g > 240 && b > 240) {
      line += ' ';
    } else if (r > 220 && g > 220 && b > 220) {
      line += 'W'; // White glint
    } else if (r > 200 && g > 130 && b < 50) {
      line += 'Y'; // Yellow beak
    } else if (r > 200 && g < 50 && b < 50) {
      line += 'R'; // Bright red
    } else if (r > 100 && g < 30 && b < 40) {
      line += 'M'; // Maroon body
    } else {
      line += 'D'; // Dark shadow / outline
    }
  }
  console.log(line);
}
