import { OWL_ART_DATA } from './src/ui/owl-art-data.ts';

// Let's print each half-block row as top and bottom pixel rows
const colors = {
  '#000000': '  ',
  '#5A0018': 'D ', // Dark outline/shadow
  '#8E0030': 'M ', // Maroon body
  '#F10032': 'R ', // Red eye/mag glass rim
  '#FFFFFF': 'W ', // White glint
  '#FDC727': 'Y ', // Yellow beak
  '#5588AA': 'B ', // Blue glass
};

console.log('Pixel Grid:');
for (let r = 0; r < OWL_ART_DATA.length; r++) {
  const row = OWL_ART_DATA[r];
  let topRow = '';
  let bottomRow = '';
  for (let c = 0; c < row.length; c++) {
    const cell = row[c];
    const topChar = colors[cell.fg] || '??';
    const bottomChar = colors[cell.bg] || '??';
    topRow += topChar;
    bottomRow += bottomChar;
  }
  console.log(`Row ${String(2*r).padStart(2, '0')}: ${topRow}`);
  console.log(`Row ${String(2*r+1).padStart(2, '0')}: ${bottomRow}`);
}
