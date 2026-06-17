const fs = require('fs');
const content = fs.readFileSync('src/ui/owl-art-data.ts', 'utf8');
// Show a basic shape using bg hex
const lines = content.split('\n').filter(l => l.trim().startsWith('[{'));
lines.forEach((line, idx) => {
  const matches = line.matchAll(/bg:"([0-9a-fA-F]{6})"/g);
  let row = '';
  for (const m of matches) {
    const hex = m[1];
    const v = parseInt(hex, 16);
    const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    if (r < 15 && g < 15 && b < 15) row += '.';
    else if (r > 150 && g < 50 && b < 50) row += 'O'; // bright red
    else if (r > 100 && g < 50 && b < 50) row += 'o'; // dark red
    else if (g > 150 && r < 100) row += 'Y'; // yellow
    else row += '?';
  }
  console.log(idx.toString().padStart(2,' ') + ': ' + row);
});
