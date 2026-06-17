const { PNG } = require('pngjs');
const fs = require('fs');

const buf = fs.readFileSync('owl.png');
const png = PNG.sync.read(buf);

let minX = png.width, maxX = 0, minY = png.height, maxY = 0;
for (let y = 0; y < png.height; y++) {
  for (let x = 0; x < png.width; x++) {
    const idx = (y * png.width + x) * 4;
    const r = png.data[idx], g = png.data[idx+1], b = png.data[idx+2];
    const isBg = (r > 240 && g > 240 && b > 240) || (r < 15 && g < 15 && b < 15);
    if (!isBg) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
const w = maxX - minX;
const h = maxY - minY;
const scale = Math.max(w, h) / 14;

for (let py = 0; py < 14; py++) {
  let line = '';
  for (let px = 0; px < 14; px++) {
    const sx = Math.floor(minX + px * scale);
    const sy = Math.floor(minY + py * scale);
    if (sx > maxX || sy > maxY) {
       line += '  '; continue;
    }
    const idx = (sy * png.width + sx) * 4;
    const r = png.data[idx], g = png.data[idx+1], b = png.data[idx+2];
    let c = ' ';
    if (r > 200 && g < 100 && b < 100) c = 'R'; // Bright Red
    else if (r > 100 && g < 80 && b < 80) c = 'r'; // Dark Red
    else if (r > 150 && g > 150 && b > 150) c = 'W'; // White
    else if (r > 150 && g > 150 && b < 100) c = 'Y'; // Yellow
    else if (r < 50 && g < 50 && b < 50) c = 'B'; // Black
    else if (Math.abs(r-g) < 20 && Math.abs(g-b) < 20 && r > 100) c = 'G'; // Grey
    else if (r > 80) c = 'm'; // other reddish/brownish
    else c = '.';
    line += c;
  }
  console.log(line);
}
