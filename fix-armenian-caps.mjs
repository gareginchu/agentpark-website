import { readFileSync, writeFileSync } from 'fs';

function isArmenianUpper(ch) {
  const c = ch.charCodeAt(0);
  return c >= 0x0531 && c <= 0x0556;
}
function isArmenianLower(ch) {
  const c = ch.charCodeAt(0);
  return c >= 0x0561 && c <= 0x0586;
}
function isArmenian(ch) {
  return isArmenianUpper(ch) || isArmenianLower(ch);
}
function toLower(ch) {
  if (isArmenianUpper(ch)) return String.fromCharCode(ch.charCodeAt(0) + 0x30);
  return ch;
}
function toUpper(ch) {
  if (isArmenianLower(ch)) return String.fromCharCode(ch.charCodeAt(0) - 0x30);
  return ch;
}

function isAllCapsArmenian(str) {
  let hasUpper = false, hasLower = false;
  for (const ch of str) {
    if (isArmenianUpper(ch)) hasUpper = true;
    if (isArmenianLower(ch)) hasLower = true;
  }
  return hasUpper && !hasLower;
}

const SENTENCE_ENDERS = new Set([':', '\u0589', '!', '?']);

function fixArmenianCaps(str) {
  if (isAllCapsArmenian(str)) return str;
  if (str.includes('://')) return str;

  const parts = str.split(/(<[^>]+>)/);
  let sentenceStart = true;

  for (let p = 0; p < parts.length; p++) {
    if (parts[p].startsWith('<')) continue;

    const chars = [...parts[p]];
    let result = '';
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];

      if (SENTENCE_ENDERS.has(ch)) {
        sentenceStart = true;
        result += ch;
        continue;
      }

      if (isArmenian(ch)) {
        if (i > 0 && chars[i - 1] === '-' && i > 1 && !isArmenian(chars[i - 2])) {
          result += toLower(ch);
          sentenceStart = false;
          continue;
        }

        if (sentenceStart) {
          result += toUpper(ch);
          sentenceStart = false;
        } else {
          result += toLower(ch);
        }
      } else {
        result += ch;
      }
    }
    parts[p] = result;
  }

  return parts.join('');
}

function processFile(filePath) {
  let content = readFileSync(filePath, 'utf8');
  let changeCount = 0;

  // Process LINE BY LINE to avoid cross-line regex matches
  const lines = content.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    // Only process lines that contain Armenian characters
    if (!/[\u0531-\u0586]/.test(line)) continue;

    lines[li] = line.replace(/'([^']*[\u0531-\u0586][^']*)'/g, (match, value) => {
      const fixed = fixArmenianCaps(value);
      if (fixed !== value) {
        changeCount++;
        console.log(`  L${li + 1}: "${value}" → "${fixed}"`);
      }
      return "'" + fixed + "'";
    });
  }

  const newContent = lines.join('\n');
  if (changeCount > 0) {
    writeFileSync(filePath, newContent, 'utf8');
    console.log(`✓ ${filePath}: ${changeCount} changes\n`);
  } else {
    console.log(`✓ ${filePath}: no changes needed\n`);
  }
}

const files = ['index.html', 'event.html', 'admin.html'];
for (const f of files) {
  console.log(`Processing ${f}...`);
  processFile(f);
}
console.log('Done!');
