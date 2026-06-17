import { OWL_ART_DATA } from './src/ui/owl-art-data.ts';

// Deep clone data
const modified = JSON.parse(JSON.stringify(OWL_ART_DATA));

// Apply proposed changes:
// 1. Enclose the right magnifying glass boundary at Row 3 (pixel Row 7) Col 4
modified[3][4].bg = '#5A0018'; // Change from #5588AA to #5A0018

// 2. Define the wing and shadow at Row 4 (pixel Row 8 & 9) Col 5 and Col 6
modified[4][5].bg = '#8E0030'; // Change wing-bottom from #5A0018 (D) to #8E0030 (M)
modified[4][6].fg = '#5A0018'; // Change shadow-top from #8E0030 (M) to #5A0018 (D)
modified[4][6].bg = '#5A0018'; // Change shadow-bottom from #8E0030 (M) to #5A0018 (D)

// 3. Define the wing and shadow at Row 5 (pixel Row 10 & 11) Col 5 and Col 6
modified[5][5].fg = '#8E0030'; // Change wing-top from #F10032 (R) to #8E0030 (M)
modified[5][6].fg = '#5A0018'; // Change shadow-top from #8E0030 (M) to #5A0018 (D)

const colors = {
  '#000000': '  ',
  '#5A0018': 'D ', // Dark outline/shadow
  '#8E0030': 'M ', // Maroon body
  '#F10032': 'R ', // Red eye/mag glass rim
  '#FFFFFF': 'W ', // White glint
  '#FDC727': 'Y ', // Yellow beak
  '#5588AA': 'B ', // Blue glass
};

console.log('Proposed Pixel Grid:');
for (let r = 0; r < modified.length; r++) {
  const row = modified[r];
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
