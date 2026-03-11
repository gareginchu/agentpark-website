import { readFileSync, writeFileSync } from 'fs';

// Fix specific labels that should be lowercase (they're unit labels, not sentences)
// Armenian: uppercase U+0531-U+0556, lowercase U+0561-U+0586

function toLower(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 0x0531 && c <= 0x0556) return String.fromCharCode(c + 0x30);
  return ch;
}

// Specific fixes: [file, old_value, new_value]
// We match exact string values and replace them
const fixes = [
  // admin.html — unit labels used after numbers
  ['admin.html', '\u054A\u0561\u057F\u056F\u0565\u0580', '\u057A\u0561\u057F\u056F\u0565\u0580'],  // Պatker → пatker (image-singular)
  ['admin.html', '\u054A\u0561\u057F\u056F\u0565\u0580', '\u057A\u0561\u057F\u056F\u0565\u0580'],  // Пatker → пatker (images-plural, duplicate)
  ['admin.html', '\u0533\u0580\u0561\u0576\u0581\u0578\u0582\u0574', '\u0563\u0580\u0561\u0576\u0581\u0578\u0582\u0574'],  // Гdelays → гdelays (registration-singular)
  ['admin.html', '\u0533\u0580\u0561\u0576\u0581\u0578\u0582\u0574', '\u0563\u0580\u0561\u0576\u0581\u0578\u0582\u0574'],  // Гdelays → гdelays (registrations-plural)

  // admin.html — stat-avg-label
  ['admin.html', '\u0544\u056B\u057B.', '\u0574\u056B\u057B.'],  // Մdelays. → мdelays.

  // admin.html — analytics labels (not sentences, used as subtitles after numbers)
  // analytics-page-views: Էdelays դdelays → էdelays дdelays
  ['admin.html', '\u0537\u057B\u056B \u0564\u056B\u057F\u0578\u0582\u0574\u0576\u0565\u0580', '\u0567\u057B\u056B \u0564\u056B\u057F\u0578\u0582\u0574\u0576\u0565\u0580'],
  // analytics-unique-sessions: Еdelays нdelays → еdelays нdelays
  ['admin.html', '\u0535\u0566\u0561\u056F\u056B \u0576\u056B\u057D\u057F\u0565\u0580', '\u0565\u0566\u0561\u056F\u056B \u0576\u056B\u057D\u057F\u0565\u0580'],

  // admin.html — analytics-bounce-change: ↓ 4% Нdelays amsva → ↓ 4% нdelays amsva
  ['admin.html', '\u2193 4% \u0546\u0561\u056D\u0578\u0580\u0564 \u0561\u0574\u057D\u057E\u0561', '\u2193 4% \u0576\u0561\u056D\u0578\u0580\u0564 \u0561\u0574\u057D\u057E\u0561'],
  // admin.html — analytics-duration-change: ↑ 12Вdelays нdelays amsva → ↑ 12вdelays нdelays amsva
  ['admin.html', '\u2191 12\u054E \u0576\u0561\u056D\u0578\u0580\u0564 \u0561\u0574\u057D\u057E\u0561', '\u2191 12\u057E \u0576\u0561\u056D\u0578\u0580\u0564 \u0561\u0574\u057D\u057E\u0561'],

  // event.html — unit labels
  // spots-available: Тdelays хdelays → тdelays хdelays
  ['event.html', '\u054F\u0565\u0572 \u0570\u0561\u057D\u0561\u0576\u0565\u056C\u056B', '\u057F\u0565\u0572 \u0570\u0561\u057D\u0561\u0576\u0565\u056C\u056B'],
  // attendees: Мdelays → мdelays
  ['event.html', '\u0544\u0561\u057D\u0576\u0561\u056F\u056B\u0581', '\u0574\u0561\u057D\u0576\u0561\u056F\u056B\u0581'],
];

for (const [file, oldVal, newVal] of fixes) {
  let content = readFileSync(file, 'utf8');
  if (content.includes(oldVal)) {
    // Replace all occurrences
    content = content.split(oldVal).join(newVal);
    writeFileSync(file, content, 'utf8');
    console.log(`Fixed in ${file}: "${oldVal}" → "${newVal}"`);
  } else {
    console.log(`Not found in ${file}: "${oldVal}"`);
  }
}

console.log('\nDone!');
