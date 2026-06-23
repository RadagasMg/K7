const fs = require('fs');
const path = require('path');

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== '.next' && file !== 'node_modules' && file !== '.git') {
        walk(fullPath);
      }
    } else {
      if (/\.(tsx|ts|js|jsx)$/.test(file)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('next/document')) {
          console.log('FOUND next/document in: ' + fullPath);
        }
        if (content.includes('<Html>') || content.includes('<Html ')) {
             console.log('FOUND <Html> in: ' + fullPath);
        }
      }
    }
  }
}

walk('.');
