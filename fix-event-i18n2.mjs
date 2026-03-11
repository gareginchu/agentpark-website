import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync('event.html', 'utf8');

// Fix date locale on line 522 (hero meta date - with weekday)
content = content.replace(
  "new Date(ev.date).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})",
  "new Date(ev.date).toLocaleDateString(currentLang === 'am' ? 'hy-AM' : 'en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})"
);

// Fix date locale on line 545 (reg card date - without weekday) — there are two occurrences
content = content.replaceAll(
  "new Date(ev.date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})",
  "new Date(ev.date).toLocaleDateString(currentLang === 'am' ? 'hy-AM' : 'en-US',{month:'long',day:'numeric',year:'numeric'})"
);

writeFileSync('event.html', content, 'utf8');
console.log('Done! Fixed event.html date locales');
