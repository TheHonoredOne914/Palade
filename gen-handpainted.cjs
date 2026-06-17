const fs = require('fs');

// Hand-painted 16x16 pixel grid (= 8 half-block rows)
// Based on analyze.cjs output from the reference image, with eyes fixed to be symmetric
const gridData = [
  [' ',' ',' ',' ',' ',' ',' ',' ',' ',' ',' ',' ',' ',' ',' ',' '], // Row 00
  [' ',' ',' ','M',' ',' ',' ',' ',' ',' ',' ',' ',' ',' ','M',' '], // Row 01
  [' ',' ',' ','M','M',' ','M','M','M','M','M','M',' ','M','M',' '], // Row 02
  [' ',' ',' ',' ','M','M','M','M','M','M','M','M','M','M',' ',' '], // Row 03
  [' ',' ',' ','M','M','R','R','M','M','M','R','R','R','M','M',' '], // Row 04
  [' ',' ',' ','M','R','W','R','R','M','R','R','W','R','R','M',' '], // Row 05 (W at cols 5, 11)
  [' ','D','D','D','D','R','R','R','M','R','R','R','R','R','M',' '], // Row 06
  ['D','R','M','M','R','D','R','M','Y','M','M','R','R','M','M',' '], // Row 07
  ['D','M','W','R','M','D','M','M','M','M','M','M','M','M','D',' '], // Row 08 (W at col 2)
  ['D','M','R','R','M','D','M','M','M','M','M','M','M','D','M','M'], // Row 09
  [' ','D','R','R','D','R','M','M','M','M','M','M','M','D','M','M'], // Row 10
  [' ','D','D','D','D','M','D','M','M','M','M','M','M','D','M','D'], // Row 11
  [' ',' ',' ','D','D','M','D','M','M','M','M','M','M','M','D',' '], // Row 12
  [' ',' ',' ',' ','D','D','D','M','M','M','M','D','D','D',' ',' '], // Row 13
  [' ',' ',' ',' ',' ','D','D',' ',' ',' ',' ','D','D',' ',' ',' '], // Row 14
  [' ',' ',' ',' ',' ',' ',' ',' ',' ',' ',' ',' ',' ',' ',' ',' '], // Row 15
];

const colors = {
  ' ': '#000000', // transparent
  'D': '#5A0018', // dark outline
  'M': '#8E0030', // body maroon
  'R': '#F10032', // bright red (eyes, mag glass ring)
  'W': '#FFFFFF', // white (glints)
  'Y': '#FDC727', // yellow-orange (beak)
};

const TARGET_COLS = 16;
const pixelRows = 16;
const OWL_DATA = [];

for (let row = 0; row < pixelRows; row += 2) {
  const line = [];
  for (let col = 0; col < TARGET_COLS; col++) {
    const topChar = gridData[row][col];
    const bottomChar = gridData[row + 1][col];
    const topColor = colors[topChar];
    const bottomColor = colors[bottomChar];
    const transparent = (topChar === ' ' && bottomChar === ' ');
    line.push({ fg: topColor, bg: bottomColor, transparent });
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
console.log('8-row owl generated: ' + TARGET_COLS + ' x ' + OWL_DATA.length);
