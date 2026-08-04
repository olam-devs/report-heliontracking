const fs = require('fs');
const path = require('path');

const files = [
  'src/models/MechanicModel.js',
  'src/controllers/mechanicController.js',
  'src/routes/mechanic.js',
];

for (const f of files) {
  const full = path.join(__dirname, f);
  const content = fs.readFileSync(full, 'utf8');
  console.log(`\n=== ${f} ===`);
  // Show key lines
  const lines = content.split('\n');
  lines.forEach((l, i) => {
    if (l.includes('getLogsForDate') || l.includes('BETWEEN') || l.includes('vehicle-history') || l.includes('WHERE 1=1') || l.includes('devIdno || plate')) {
      console.log(`  L${i+1}: ${l.trim()}`);
    }
  });
}
