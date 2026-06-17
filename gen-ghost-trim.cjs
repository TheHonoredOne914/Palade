const data = require('./dist/ui/ghost-owl-art-data.js').GHOST_OWL_ART_DATA;
const fs = require('fs');

const rows = data.length;
const cols = data[0].length;
const targetRows = 8;
const targetCols = 14;
const startRow = Math.floor((rows - targetRows) / 2);
const startCol = Math.floor((cols - targetCols) / 2);

const trimmed = [];
for (let r = startRow; r < startRow + targetRows; r++) {
  trimmed.push(data[r].slice(startCol, startCol + targetCols));
}

let ts = 'export const GHOST_OWL_ART_TRIMMED: { fg: string; bg: string }[][] = [\n';
for (const line of trimmed) {
  const cells = line.map(c => `{fg:"${c.fg}",bg:"${c.bg}"}`).join(',');
  ts += `  [${cells}],\n`;
}
ts += ']\n';

fs.writeFileSync('src/ui/ghost-owl-art-trimmed.ts', ts);
console.log('Trimmed ghost owl:', targetCols, 'x', targetRows);
console.log('Center crop from', cols, 'x', rows, 'starting at row', startRow, 'col', startCol);
