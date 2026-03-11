const fs = require('fs');
const path = 'c:/Users/gareg/OneDrive/Documents/Agentic Workflows/Website Building Henke/fix-armenian.mjs';
let code = fs.readFileSync(path, 'utf8');
// Fix \uXXX (3-digit) -> \u0XXX (4-digit) in the source text
const re = /\\u([0-9a-fA-F]{3})(?![0-9a-fA-F])/g;
const prefix = '\\u0';
code = code.replace(re, function(m, h) { return prefix + h; });
fs.writeFileSync(path, code);
console.log('Fixed. Checking for remaining 3-digit escapes:');
const remaining = code.match(/\\u[0-9a-fA-F]{3}(?![0-9a-fA-F])/g);
console.log(remaining ? remaining.slice(0, 5) : 'None');
